package org.apache.datawise.desktop.updater;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class DesktopUpdaterServiceVersionTest {
    @TempDir
    Path temp;

    @Test
    void readsVersionFromLocalManifest() throws Exception {
        Path manifest = temp.resolve("local_version.json");
        Files.writeString(manifest, "{\"schema\":1,\"version\":\"9.8.7\"}\n", StandardCharsets.UTF_8);
        assertEquals("9.8.7", DesktopUpdaterService.readVersionField(manifest));
    }

    @Test
    void missingOrInvalidManifestReturnsNull() {
        assertNull(DesktopUpdaterService.readVersionField(temp.resolve("missing.json")));
    }

    @Test
    void compareSemverOrdersVersions() {
        assertEquals(1, DesktopUpdaterService.compareSemver("4.0.2", "4.0.1"));
        assertEquals(-1, DesktopUpdaterService.compareSemver("4.0.0", "4.0.1"));
        assertEquals(0, DesktopUpdaterService.compareSemver("4.0.1", "v4.0.1"));
    }
}
