package org.apache.datawise.desktop.backend;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BackendRuntimeLogPathTest {

    @TempDir
    Path temp;

    @Test
    void prefersActiveDatawiseLogWhenPresent() throws Exception {
        Path logs = temp.resolve("logs");
        Files.createDirectories(logs);
        Path active = logs.resolve("datawise.log");
        Path older = logs.resolve("other.log");
        Files.writeString(active, "active\n");
        Files.writeString(older, "older\n");
        Files.setLastModifiedTime(older, FileTime.from(Instant.now().plusSeconds(60)));

        assertEquals(active, BackendProcessService.resolvePreferredRuntimeLog(logs));
    }

    @Test
    void fallsBackToNewestLogWhenActiveMissing() throws Exception {
        Path logs = temp.resolve("logs");
        Files.createDirectories(logs);
        Path older = logs.resolve("a.log");
        Path newer = logs.resolve("b.log");
        Files.writeString(older, "a\n");
        Files.writeString(newer, "b\n");
        Files.setLastModifiedTime(older, FileTime.from(Instant.parse("2020-01-01T00:00:00Z")));
        Files.setLastModifiedTime(newer, FileTime.from(Instant.parse("2024-01-01T00:00:00Z")));

        assertEquals(newer, BackendProcessService.resolvePreferredRuntimeLog(logs));
    }

    @Test
    void returnsActivePathEvenWhenMissing() {
        Path logs = temp.resolve("logs");
        assertEquals(logs.resolve("datawise.log"), BackendProcessService.resolvePreferredRuntimeLog(logs));
    }
}
