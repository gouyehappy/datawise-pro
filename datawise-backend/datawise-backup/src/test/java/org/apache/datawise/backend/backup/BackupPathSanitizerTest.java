package org.apache.datawise.backend.backup;

import org.apache.datawise.backend.config.BackupProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BackupPathSanitizerTest {

    @TempDir
    Path configRoot;

    @Test
    void defaultRootUnderConfig() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(configRoot);
        BackupProperties properties = new BackupProperties();
        Path root = BackupPathSanitizer.resolveDestinationRoot(configDirectory, properties, null);
        assertTrue(root.endsWith("backups"));
    }

    @Test
    void rejectsTraversal() {
        assertThrows(IllegalArgumentException.class, () -> BackupPathSanitizer.rejectEscape(Path.of("a", "..", "b")));
    }
}
