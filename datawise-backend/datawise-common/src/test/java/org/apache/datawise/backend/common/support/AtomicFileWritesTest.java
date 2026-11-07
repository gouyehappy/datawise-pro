package org.apache.datawise.backend.common.support;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AtomicFileWritesTest {

    @TempDir
    Path tempDir;

    @Test
    void moveReplaceOverwritesExistingTarget() throws Exception {
        Path target = tempDir.resolve("app.xml");
        Files.writeString(target, "old", StandardCharsets.UTF_8);
        Path staging = Files.createTempFile(tempDir, "app.xml.", ".tmp");
        Files.writeString(staging, "new-content", StandardCharsets.UTF_8);

        AtomicFileWrites.moveReplace(staging, target);

        assertEquals("new-content", Files.readString(target, StandardCharsets.UTF_8));
        assertFalse(Files.exists(staging));
    }

    @Test
    void moveReplaceCreatesMissingTarget() throws Exception {
        Path target = tempDir.resolve("fresh.json");
        Path staging = Files.createTempFile(tempDir, "fresh.json-", ".tmp");
        Files.writeString(staging, "{\"ok\":true}", StandardCharsets.UTF_8);

        AtomicFileWrites.moveReplace(staging, target);

        assertTrue(Files.isRegularFile(target));
        assertEquals("{\"ok\":true}", Files.readString(target, StandardCharsets.UTF_8));
    }
}
