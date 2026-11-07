package org.apache.datawise.backend.configstore;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TenantScopedConfigSupportTest {

    @TempDir
    Path tempDir;

    @Test
    void ensureTenantRelativePath_migratesLegacyFile() throws Exception {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        Path legacy = configDirectory.resolve(ConfigPaths.TEAMS);
        Files.writeString(legacy, "{\"teams\":[]}", StandardCharsets.UTF_8);

        String relative = TenantScopedConfigSupport.ensureTenantRelativePath(
                configDirectory,
                TenantScopedConfigSupport.defaultTenantTeamsPath(),
                ConfigPaths.TEAMS);

        Path tenantPath = configDirectory.resolve(relative);
        assertTrue(Files.isRegularFile(tenantPath));
        assertFalse(Files.exists(legacy));
        assertTrue(Files.exists(legacy.resolveSibling("teams.json.migrated")));
        assertEquals("{\"teams\":[]}", Files.readString(tenantPath));
    }
}
