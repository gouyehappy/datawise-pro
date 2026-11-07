package org.apache.datawise.backend.backup;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ZipArchiveSupportTest {

    @TempDir
    Path tempDir;

    @Test
    void createZipAndSha256() throws Exception {
        Path source = tempDir.resolve("hello.txt");
        Files.writeString(source, "hello backup");
        Path zip = tempDir.resolve("test.zip");
        ZipArchiveSupport.createZip(zip, Map.of("hello.txt", source));

        assertTrue(Files.exists(zip));
        String hash = ZipArchiveSupport.sha256(zip);
        assertEquals(64, hash.length());
    }

    @Test
    void extractZipRoundTrip() throws Exception {
        Path source = tempDir.resolve("data.txt");
        Files.writeString(source, "payload");
        Path zip = tempDir.resolve("pack.zip");
        ZipArchiveSupport.createZip(zip, Map.of("data.txt", source));

        Path target = tempDir.resolve("out");
        ZipArchiveSupport.extractZip(zip, target);
        assertEquals("payload", Files.readString(target.resolve("data.txt")));
    }

    @Test
    void extractZipRejectsZipSlip() throws Exception {
        Path zip = tempDir.resolve("evil.zip");
        try (var out = Files.newOutputStream(zip);
             var zos = new java.util.zip.ZipOutputStream(out)) {
            zos.putNextEntry(new java.util.zip.ZipEntry("../escape.txt"));
            zos.write("bad".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zos.closeEntry();
        }
        Path target = tempDir.resolve("out");
        IOException ex = assertThrows(IOException.class, () -> ZipArchiveSupport.extractZip(zip, target));
        assertTrue(ex.getMessage().contains("escapes"));
        assertTrue(Files.notExists(tempDir.resolve("escape.txt")));
    }
}
