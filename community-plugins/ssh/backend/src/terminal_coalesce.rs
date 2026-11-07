//! Merge PTY stdout/stderr bursts **before** replay sequence assignment.
//!
//! Small OS/SSH reads otherwise become one framed binary IPC message each;
//! coalescing 8–16 ms (or ~64 KiB) cuts host/WS/UI load for `tail -f` floods
//! without changing State-frame immediacy.
//!
//! Chunks keep arrival order across stdout/stderr: consecutive same-stream
//! bytes merge; a stream switch starts a new segment so ExtendedData cannot
//! leapfrog later stdout inside one coalesce window.

use std::time::{Duration, Instant};

use crate::model::TerminalStream;

/// Soft latency budget — slightly under the frontend write throttle.
pub const FLUSH_DELAY: Duration = Duration::from_millis(12);
/// Force a flush once queued bytes reach this size.
pub const FLUSH_BYTES: usize = 64 * 1024;

#[derive(Debug)]
struct Segment {
    stream: TerminalStream,
    data: Vec<u8>,
}

#[derive(Debug, Default)]
pub struct TerminalOutputCoalescer {
    segments: Vec<Segment>,
    pending_bytes: usize,
    first_queued_at: Option<Instant>,
    flush_delay: Duration,
    flush_bytes: usize,
}

impl TerminalOutputCoalescer {
    pub fn new() -> Self {
        Self {
            segments: Vec::new(),
            pending_bytes: 0,
            first_queued_at: None,
            flush_delay: FLUSH_DELAY,
            flush_bytes: FLUSH_BYTES,
        }
    }

    pub fn pending_bytes(&self) -> usize {
        self.pending_bytes
    }

    pub fn is_empty(&self) -> bool {
        self.segments.is_empty()
    }

    /// True when a timed flush is due (or the buffer is already over the byte cap).
    pub fn should_flush_at(&self, now: Instant) -> bool {
        if self.is_empty() {
            return false;
        }
        if self.pending_bytes >= self.flush_bytes {
            return true;
        }
        self.first_queued_at
            .is_some_and(|started| now.duration_since(started) >= self.flush_delay)
    }

    /// Queue stdout/stderr. State/Stdin are never buffered — caller must flush then publish.
    pub fn push(&mut self, stream: TerminalStream, data: Vec<u8>) -> PushOutcome {
        if data.is_empty() {
            return PushOutcome::Ignored;
        }
        match stream {
            TerminalStream::State | TerminalStream::Stdin => PushOutcome::Bypass,
            TerminalStream::Stdout | TerminalStream::Stderr => {
                self.append(stream, data);
                PushOutcome::Buffered {
                    flush_now: self.pending_bytes >= self.flush_bytes,
                }
            }
        }
    }

    /// Drain merged segments in arrival order.
    pub fn take_all(&mut self) -> Vec<(TerminalStream, Vec<u8>)> {
        let out = self
            .segments
            .drain(..)
            .map(|segment| (segment.stream, segment.data))
            .collect();
        self.pending_bytes = 0;
        self.first_queued_at = None;
        out
    }

    fn append(&mut self, stream: TerminalStream, data: Vec<u8>) {
        if self.first_queued_at.is_none() {
            self.first_queued_at = Some(Instant::now());
        }
        self.pending_bytes += data.len();
        if let Some(last) = self.segments.last_mut() {
            if last.stream == stream {
                last.data.extend_from_slice(&data);
                return;
            }
        }
        self.segments.push(Segment { stream, data });
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PushOutcome {
    Ignored,
    /// Not coalesced (State etc.) — flush pending first, then publish as-is.
    Bypass,
    Buffered { flush_now: bool },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_stdout_until_flush() {
        let mut c = TerminalOutputCoalescer::new();
        assert_eq!(
            c.push(TerminalStream::Stdout, b"a".to_vec()),
            PushOutcome::Buffered { flush_now: false }
        );
        assert_eq!(
            c.push(TerminalStream::Stdout, b"b".to_vec()),
            PushOutcome::Buffered { flush_now: false }
        );
        let drained = c.take_all();
        assert_eq!(drained.len(), 1);
        assert_eq!(drained[0].1, b"ab");
        assert!(c.is_empty());
    }

    #[test]
    fn preserves_interleaved_stdout_stderr_order() {
        let mut c = TerminalOutputCoalescer::new();
        let _ = c.push(TerminalStream::Stdout, b"out1".to_vec());
        let _ = c.push(TerminalStream::Stderr, b"err".to_vec());
        let _ = c.push(TerminalStream::Stdout, b"out2".to_vec());
        let drained = c.take_all();
        assert_eq!(drained.len(), 3);
        assert_eq!(drained[0], (TerminalStream::Stdout, b"out1".to_vec()));
        assert_eq!(drained[1], (TerminalStream::Stderr, b"err".to_vec()));
        assert_eq!(drained[2], (TerminalStream::Stdout, b"out2".to_vec()));
    }

    #[test]
    fn merges_consecutive_same_stream_across_switches() {
        let mut c = TerminalOutputCoalescer::new();
        let _ = c.push(TerminalStream::Stderr, b"e1".to_vec());
        let _ = c.push(TerminalStream::Stderr, b"e2".to_vec());
        let _ = c.push(TerminalStream::Stdout, b"o".to_vec());
        let drained = c.take_all();
        assert_eq!(drained.len(), 2);
        assert_eq!(drained[0].1, b"e1e2");
        assert_eq!(drained[1].1, b"o");
    }

    #[test]
    fn state_bypasses_buffer() {
        let mut c = TerminalOutputCoalescer::new();
        assert_eq!(
            c.push(TerminalStream::State, b"gone".to_vec()),
            PushOutcome::Bypass
        );
        assert!(c.is_empty());
    }

    #[test]
    fn byte_cap_requests_immediate_flush() {
        let mut c = TerminalOutputCoalescer::new();
        let big = vec![0u8; FLUSH_BYTES];
        assert_eq!(
            c.push(TerminalStream::Stdout, big),
            PushOutcome::Buffered { flush_now: true }
        );
    }

    #[test]
    fn timed_flush_after_delay() {
        let mut c = TerminalOutputCoalescer::new();
        let _ = c.push(TerminalStream::Stdout, b"x".to_vec());
        let started = c.first_queued_at.expect("queued");
        assert!(!c.should_flush_at(started + Duration::from_millis(5)));
        assert!(c.should_flush_at(started + FLUSH_DELAY));
    }
}
