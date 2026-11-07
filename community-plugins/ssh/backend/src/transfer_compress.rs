//! Hybrid gzip transfer decision: local flate2 + remote gzip/gunzip.
//! Sudo upload always stays plain (home staging + `sudo mv` must not mix
//! with a compressed temp that gunzip would expand as the login user).
//!
//! Explicit lzpack (`.dbxz`) lives alongside gzip: local-only codec, remote
//! zero deps. See [`lzpack_compress_file_to`] / [`lzpack_decompress_file_to`].

use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;

use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde_json::Value;

/// Default minimum size (bytes) before Smart/Always even consider gzip.
pub const DEFAULT_THRESHOLD: u64 = 64 * 1024 * 1024;

/// If compressed size is this fraction of the original (or more), stay plain.
pub const WASTEFUL_RATIO: f64 = 0.95;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompressionStrategy {
    Off,
    Smart,
    Always,
}

impl CompressionStrategy {
    pub fn parse(value: &str) -> Self {
        match value.trim() {
            "always" => Self::Always,
            "off" => Self::Off,
            _ => Self::Smart,
        }
    }

    #[allow(dead_code)]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::Smart => "smart",
            Self::Always => "always",
        }
    }
}

/// Extensions that are already compressed — gzipping them wastes CPU.
const INCOMPRESSIBLE: &[&str] = &[
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic",
    ".mp3", ".mp4", ".mkv", ".mov", ".avi", ".webm", ".ogg",
    ".zip", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".zst",
    ".br", ".woff2", ".pdf",
];

pub fn strategy_from_prefs(prefs: &Value) -> CompressionStrategy {
    prefs
        .get("compressionStrategy")
        .and_then(Value::as_str)
        .map(CompressionStrategy::parse)
        .unwrap_or(CompressionStrategy::Smart)
}

pub fn threshold_from_prefs(prefs: &Value) -> u64 {
    match prefs.get("compressionThresholdMib").and_then(Value::as_u64) {
        Some(0) => 0,
        Some(mib) => mib.saturating_mul(1024 * 1024),
        None => DEFAULT_THRESHOLD,
    }
}

pub fn is_incompressible_name(file_name: &str) -> bool {
    let lower = file_name.to_ascii_lowercase();
    INCOMPRESSIBLE.iter().any(|ext| lower.ends_with(ext))
}

pub fn local_cpu_cores() -> u32 {
    thread::available_parallelism()
        .map(|n| n.get() as u32)
        .unwrap_or(1)
}

/// Whether this file should attempt the gzip channel. Remote-tool presence
/// is a separate gate so a missing `gunzip` still falls back to plain.
pub fn should_attempt_gzip(
    strategy: CompressionStrategy,
    file_name: &str,
    size: u64,
    threshold: u64,
    cpu_cores: u32,
    sudo_lane: bool,
) -> bool {
    if sudo_lane || strategy == CompressionStrategy::Off {
        return false;
    }
    if size < threshold {
        return false;
    }
    if is_incompressible_name(file_name) {
        return false;
    }
    if strategy == CompressionStrategy::Smart && cpu_cores <= 2 {
        return false;
    }
    true
}

/// True when compressed size is worth sending instead of the original.
pub fn compression_is_worthwhile(original: u64, compressed: u64) -> bool {
    if original == 0 {
        return false;
    }
    (compressed as f64) < (original as f64) * WASTEFUL_RATIO
}

pub fn gzip_file(src: &Path, dest: &Path) -> Result<u64, String> {
    let mut input = File::open(src).map_err(|error| format!("Failed to open spool for gzip: {error}"))?;
    let output =
        File::create(dest).map_err(|error| format!("Failed to create gzip staging file: {error}"))?;
    let mut encoder = GzEncoder::new(output, Compression::default());
    std::io::copy(&mut input, &mut encoder)
        .map_err(|error| format!("gzip encode failed: {error}"))?;
    encoder
        .finish()
        .map_err(|error| format!("gzip finish failed: {error}"))?;
    std::fs::metadata(dest)
        .map(|meta| meta.len())
        .map_err(|error| format!("gzip output missing: {error}"))
}

pub fn gunzip_file(src: &Path, dest: &Path) -> Result<u64, String> {
    let input = File::open(src).map_err(|error| format!("Failed to open gzip file: {error}"))?;
    let output =
        File::create(dest).map_err(|error| format!("Failed to create gunzip target: {error}"))?;
    let mut decoder = GzDecoder::new(BufReader::new(input));
    let mut writer = BufWriter::new(output);
    std::io::copy(&mut decoder, &mut writer)
        .map_err(|error| format!("gunzip decode failed: {error}"))?;
    writer
        .flush()
        .map_err(|error| format!("gunzip flush failed: {error}"))?;
    std::fs::metadata(dest)
        .map(|meta| meta.len())
        .map_err(|error| format!("gunzip output missing: {error}"))
}

/// Explicit `.dbxz` compress (ST10): spool → container. No ratio gate — the
/// user asked for a compressed deliverable even when the ratio is poor.
pub fn lzpack_compress_file_to(
    source: &Path,
    target: &Path,
    cancelled: &AtomicBool,
    progress: &dyn Fn(u64),
) -> std::io::Result<u64> {
    let mut input = Vec::new();
    File::open(source)?.read_to_end(&mut input)?;
    if cancelled.load(Ordering::Acquire) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Interrupted,
            "transfer cancelled",
        ));
    }
    let mut packed: Vec<u8> = Vec::with_capacity(input.len() / 2 + 64);
    crate::lzpack::compress(&input, &mut |slice: &[u8]| packed.extend_from_slice(slice))
        .map_err(|error| std::io::Error::other(format!("lzpack compress failed: {error}")))?;
    if cancelled.load(Ordering::Acquire) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Interrupted,
            "transfer cancelled",
        ));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(target, &packed)?;
    progress(input.len() as u64);
    Ok(packed.len() as u64)
}

/// Explicit `.dbxz` decompress (ST10): container → original bytes.
pub fn lzpack_decompress_file_to(
    source: &Path,
    target: &Path,
    cancelled: &AtomicBool,
    progress: &dyn Fn(u64),
) -> std::io::Result<u64> {
    let packed = std::fs::read(source)?;
    if cancelled.load(Ordering::Acquire) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Interrupted,
            "transfer cancelled",
        ));
    }
    let mut restored: Vec<u8> = Vec::new();
    let result = crate::lzpack::decompress(&packed, None, &mut |slice: &[u8]| {
        restored.extend_from_slice(slice);
    });
    if cancelled.load(Ordering::Acquire) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Interrupted,
            "transfer cancelled",
        ));
    }
    let total = result
        .map_err(|error| std::io::Error::other(format!("lzpack decompress failed: {error}")))?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(target, &restored)?;
    progress(total as u64);
    Ok(total as u64)
}

/// Probe output from `command -v gzip; command -v gunzip` (or similar).
pub fn remote_gzip_tools_present(probe_output: &str) -> bool {
    let lines: Vec<&str> = probe_output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let has_gzip = lines.iter().any(|line| line.ends_with("gzip") || line.contains("/gzip"));
    let has_gunzip = lines
        .iter()
        .any(|line| line.ends_with("gunzip") || line.contains("/gunzip"));
    has_gzip && has_gunzip
}

pub const GZIP_PROBE_COMMAND: &str = "command -v gzip; command -v gunzip";

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn smart_skips_small_incompressible_low_cpu_and_sudo() {
        assert!(!should_attempt_gzip(
            CompressionStrategy::Smart,
            "photo.jpg",
            200 * 1024 * 1024,
            DEFAULT_THRESHOLD,
            8,
            false
        ));
        assert!(!should_attempt_gzip(
            CompressionStrategy::Smart,
            "notes.txt",
            1024,
            DEFAULT_THRESHOLD,
            8,
            false
        ));
        assert!(!should_attempt_gzip(
            CompressionStrategy::Smart,
            "notes.txt",
            200 * 1024 * 1024,
            DEFAULT_THRESHOLD,
            2,
            false
        ));
        assert!(!should_attempt_gzip(
            CompressionStrategy::Always,
            "notes.txt",
            200 * 1024 * 1024,
            DEFAULT_THRESHOLD,
            8,
            true
        ));
        assert!(!should_attempt_gzip(
            CompressionStrategy::Off,
            "notes.txt",
            200 * 1024 * 1024,
            0,
            8,
            false
        ));
        assert!(should_attempt_gzip(
            CompressionStrategy::Smart,
            "notes.txt",
            200 * 1024 * 1024,
            DEFAULT_THRESHOLD,
            8,
            false
        ));
        assert!(should_attempt_gzip(
            CompressionStrategy::Always,
            "notes.txt",
            DEFAULT_THRESHOLD,
            DEFAULT_THRESHOLD,
            1,
            false
        ));
    }

    #[test]
    fn prefs_and_ratio_helpers() {
        assert_eq!(
            strategy_from_prefs(&json!({ "compressionStrategy": "always" })),
            CompressionStrategy::Always
        );
        assert_eq!(threshold_from_prefs(&json!({ "compressionThresholdMib": 0 })), 0);
        assert_eq!(
            threshold_from_prefs(&json!({ "compressionThresholdMib": 2 })),
            2 * 1024 * 1024
        );
        assert!(compression_is_worthwhile(1000, 400));
        assert!(!compression_is_worthwhile(1000, 960));
        assert!(remote_gzip_tools_present("/usr/bin/gzip\n/usr/bin/gunzip\n"));
        assert!(!remote_gzip_tools_present("/usr/bin/gzip\n"));
    }

    #[test]
    fn gzip_roundtrip_shrinks_repetitive_payload() {
        let dir = tempfile::tempdir().expect("tempdir");
        let src = dir.path().join("plain.bin");
        let gz = dir.path().join("plain.bin.gz");
        let out = dir.path().join("round.bin");
        std::fs::write(&src, "aaaaaaaa".repeat(8000)).expect("write");
        let gz_len = gzip_file(&src, &gz).expect("gzip");
        assert!(gz_len < 8000 * 8);
        gunzip_file(&gz, &out).expect("gunzip");
        assert_eq!(
            std::fs::read(&src).unwrap(),
            std::fs::read(&out).unwrap()
        );
    }

    #[test]
    fn lzpack_roundtrip_restores_payload() {
        let dir = tempfile::tempdir().expect("tempdir");
        let src = dir.path().join("plain.bin");
        let packed = dir.path().join("plain.bin.dbxz");
        let out = dir.path().join("round.bin");
        std::fs::write(&src, "bbbbbbbb".repeat(4000)).expect("write");
        let cancelled = AtomicBool::new(false);
        let packed_len =
            lzpack_compress_file_to(&src, &packed, &cancelled, &|_| {}).expect("lzpack");
        assert!(packed_len > 0);
        let restored =
            lzpack_decompress_file_to(&packed, &out, &cancelled, &|_| {}).expect("expand");
        assert_eq!(restored, 4000 * 8);
        assert_eq!(
            std::fs::read(&src).unwrap(),
            std::fs::read(&out).unwrap()
        );
    }
}
