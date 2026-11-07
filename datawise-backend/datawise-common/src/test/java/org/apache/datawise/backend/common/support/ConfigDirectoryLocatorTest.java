package org.apache.datawise.backend.common.support;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConfigDirectoryLocatorTest {

    @Test
    void resolve_usesExplicitConfigRootWhenDriversPresent(@TempDir Path temp) throws Exception {
        Path config = temp.resolve("cfg");
        Files.createDirectories(config.resolve("drivers"));
        Files.writeString(config.resolve("drivers/mysql-connector-j-8.4.0.jar"), "fake");

        Path resolved = ConfigDirectoryLocator.resolve(config.toString());
        assertEquals(config.toAbsolutePath().normalize(), resolved);
        assertTrue(Files.isRegularFile(resolved.resolve("drivers/mysql-connector-j-8.4.0.jar")));
    }

    @Test
    void resolve_honorsEmptyAbsoluteWorkspaceWithoutFallingBack(@TempDir Path temp) throws Exception {
        Path workspace = temp.resolve("workspaces");
        Files.createDirectories(workspace);

        Path resolved = ConfigDirectoryLocator.resolve(workspace.toString());
        assertEquals(workspace.toAbsolutePath().normalize(), resolved);
        assertTrue(Files.isDirectory(resolved.resolve("drivers")));
        assertTrue(Files.isDirectory(resolved.resolve("plugins")));
    }
}
