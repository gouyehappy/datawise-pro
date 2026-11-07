package org.apache.datawise.backend.common.support;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConfigPathSandboxTest {

    @TempDir
    Path temp;

    @Test
    void resolvesRelativePathUnderRoot() {
        Path resolved = ConfigPathSandbox.resolveInside(temp, "secrets/db.txt");
        assertEquals(temp.resolve("secrets/db.txt").normalize(), resolved);
    }

    @Test
    void rejectsAbsoluteAndTraversal() {
        assertThrows(IllegalArgumentException.class, () -> ConfigPathSandbox.resolveInside(temp, temp.resolve("x").toString()));
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> ConfigPathSandbox.resolveInside(temp, "../outside.txt"));
        assertTrue(ex.getMessage().toLowerCase().contains("traversal")
                || ex.getMessage().toLowerCase().contains("escape"));
    }
}
