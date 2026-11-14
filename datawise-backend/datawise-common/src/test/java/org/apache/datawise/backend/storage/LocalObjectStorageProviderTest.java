package org.apache.datawise.backend.storage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LocalObjectStorageProviderTest {

    @TempDir
    Path tempDir;

    @Test
    void putGetExistsDeleteRoundTrip() throws Exception {
        LocalObjectStorageProvider storage = new LocalObjectStorageProvider(tempDir);
        ObjectStorageKey key = ObjectStorageKey.of("exports", "demo/a.sql");
        byte[] payload = "select 1".getBytes(StandardCharsets.UTF_8);

        storage.put(key, new ByteArrayInputStream(payload), payload.length, "text/plain");
        assertTrue(storage.exists(key));
        assertEquals("select 1", new String(storage.get(key).readAllBytes(), StandardCharsets.UTF_8));
        assertTrue(Files.isRegularFile(tempDir.resolve("exports").resolve("demo").resolve("a.sql")));
        assertEquals(tempDir.resolve("exports/demo/a.sql").toUri(), storage.presignGet(key, Duration.ofMinutes(5)));

        storage.delete(key);
        assertFalse(storage.exists(key));
    }

    @Test
    void rejectsPathEscape() {
        LocalObjectStorageProvider storage = new LocalObjectStorageProvider(tempDir);
        assertThrows(IllegalArgumentException.class, () -> ObjectStorageKey.of("../secret"));
    }
}
