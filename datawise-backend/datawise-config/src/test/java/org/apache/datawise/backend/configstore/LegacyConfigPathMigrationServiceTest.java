package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.domain.LegacyConfigMigrationStatusDto;
import org.apache.datawise.backend.domain.TenantIds;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LegacyConfigPathMigrationServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void scanAndApplyMigratesTenantRootAndUserFiles() throws Exception {
        Files.writeString(tempDir.resolve(ConfigPaths.TEAMS), "[{\"id\":\"t1\"}]");
        Path userDir = tempDir.resolve(ConfigPaths.USERS_DIR).resolve("1");
        Files.createDirectories(userDir);
        Files.writeString(userDir.resolve("federated-views.json"), "[]");
        Path auditDir = userDir.resolve("table-data-audit");
        Files.createDirectories(auditDir);
        Files.writeString(auditDir.resolve("conn-a.json"), "{}");

        LegacyConfigPathMigrationService service =
                new LegacyConfigPathMigrationService(new ConfigDirectoryService(tempDir));

        LegacyConfigMigrationStatusDto pending = service.scan();
        assertEquals(3, pending.pendingCount());

        LegacyConfigMigrationStatusDto applied = service.apply();
        assertEquals(0, applied.pendingCount());
        assertEquals(3, applied.migrated().size());

        assertTrue(Files.isRegularFile(tempDir.resolve(ConfigPaths.tenantTeams(TenantIds.DEFAULT))));
        assertTrue(Files.isRegularFile(tempDir.resolve(ConfigPaths.TEAMS + ".migrated")));
        assertFalse(Files.isRegularFile(tempDir.resolve(ConfigPaths.TEAMS)));

        assertTrue(Files.isRegularFile(tempDir.resolve(
                ConfigPaths.userTenantFile(1, TenantIds.DEFAULT, "federated-views.json"))));
        assertTrue(Files.isRegularFile(tempDir.resolve(
                ConfigPaths.userTenantScopeFile(1, TenantIds.DEFAULT, "table-data-audit", "conn-a"))));
    }
}
