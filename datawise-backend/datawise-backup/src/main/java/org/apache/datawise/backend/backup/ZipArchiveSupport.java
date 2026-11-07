package org.apache.datawise.backend.backup;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

public final class ZipArchiveSupport {

    private static final Logger log = LoggerFactory.getLogger(ZipArchiveSupport.class);

    private ZipArchiveSupport() {
    }

    public static void createZip(Path zipFile, Map<String, Path> entries) throws IOException {
        Files.createDirectories(zipFile.getParent());
        try (OutputStream out = Files.newOutputStream(zipFile);
             ZipOutputStream zip = new ZipOutputStream(out)) {
            for (Map.Entry<String, Path> entry : entries.entrySet()) {
                Path source = entry.getValue();
                if (!Files.exists(source)) {
                    log.warn("Skipping missing zip source entry={} path={}", entry.getKey(), source);
                    continue;
                }
                zip.putNextEntry(new ZipEntry(entry.getKey()));
                Files.copy(source, zip);
                zip.closeEntry();
            }
        }
    }

    public static void createZipFromDirectory(Path zipFile, Path sourceDir, String prefixInZip) throws IOException {
        Files.createDirectories(zipFile.getParent());
        try (OutputStream out = Files.newOutputStream(zipFile);
             ZipOutputStream zip = new ZipOutputStream(out)) {
            if (!Files.isDirectory(sourceDir)) {
                return;
            }
            try (var walk = Files.walk(sourceDir)) {
                walk.filter(Files::isRegularFile).forEach(path -> {
                    try {
                        String relative = sourceDir.relativize(path).toString().replace('\\', '/');
                        String entryName = prefixInZip != null && !prefixInZip.isBlank()
                                ? prefixInZip + "/" + relative
                                : relative;
                        zip.putNextEntry(new ZipEntry(entryName));
                        Files.copy(path, zip);
                        zip.closeEntry();
                    } catch (IOException ex) {
                        throw new java.io.UncheckedIOException(ex);
                    }
                });
            }
        }
    }

    public static void extractZip(Path zipFile, Path targetDir) throws IOException {
        Files.createDirectories(targetDir);
        try (InputStream in = Files.newInputStream(zipFile);
             ZipInputStream zip = new ZipInputStream(in)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    Files.createDirectories(targetDir.resolve(entry.getName()));
                    continue;
                }
                Path out = targetDir.resolve(entry.getName()).normalize();
                if (!out.startsWith(targetDir.normalize())) {
                    throw new IOException("zip entry escapes target directory: " + entry.getName());
                }
                Files.createDirectories(out.getParent());
                Files.copy(zip, out);
            }
        }
    }

    public static String sha256(Path file) throws IOException {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (java.security.NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
        try (InputStream in = Files.newInputStream(file);
             DigestInputStream din = new DigestInputStream(in, digest)) {
            din.transferTo(OutputStream.nullOutputStream());
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    public static String sha256Bytes(byte[] data) {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (java.security.NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
        return HexFormat.of().formatHex(digest.digest(data));
    }

    public static void verifyChecksum(Path file, String expectedSha256) throws IOException {
        if (expectedSha256 == null || expectedSha256.isBlank()) {
            throw new IllegalArgumentException("missing sha256 for " + (file != null ? file.getFileName() : "artifact"));
        }
        String actual = sha256(file);
        if (!expectedSha256.equalsIgnoreCase(actual)) {
            throw new IllegalArgumentException("checksum mismatch for " + file.getFileName()
                    + ": expected " + expectedSha256 + ", got " + actual);
        }
    }

    public static List<String> listEntryNames(Path zipFile) throws IOException {
        java.util.ArrayList<String> names = new java.util.ArrayList<>();
        try (InputStream in = Files.newInputStream(zipFile);
             ZipInputStream zip = new ZipInputStream(in)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (!entry.isDirectory()) {
                    names.add(entry.getName());
                }
            }
        }
        return names;
    }
}
