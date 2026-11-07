package org.apache.datawise.backend.server.pack;

import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.config.EntitlementProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationRequest;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MigrationBackupAccessGuardTest {

    @TempDir
    Path tempDir;

    private EntitlementProperties properties;
    private EntitlementService entitlementService;
    private MigrationBackupAccessGuard guard;

    @BeforeEach
    void setUp() {
        properties = new EntitlementProperties();
        properties.setSigningSecret("test-secret");
        properties.setFreeMigrationRowsLimit(1000);
        ObjectMapper mapper = new ObjectMapper();
        PackStateStore store = new PackStateStore(new ConfigDirectoryService(tempDir), mapper);
        entitlementService = new EntitlementService(properties, store, mapper, new PackAuditService(store));
        guard = new MigrationBackupAccessGuard(entitlementService, properties);
    }

    @Test
    void openModeDoesNotCapMigration() {
        properties.setMode("open");
        TableMigrationRequest request = sampleTableRequest(null);
        assertNull(guard.applyMigrationTrialCap(request).maxRows());
    }

    @Test
    void enforcedCapsMigrationWithoutPack() {
        properties.setMode("enforced");
        TableMigrationRequest capped = guard.applyMigrationTrialCap(sampleTableRequest(null));
        assertEquals(1000, capped.maxRows());

        TableMigrationBatchRequest batch = guard.applyMigrationTrialCap(sampleBatchRequest(5000));
        assertEquals(1000, batch.maxRows());
    }

    @Test
    void entitledMigrationKeepsRequestedMaxRows() {
        properties.setMode("enforced");
        entitlementService.startTrial(PackIds.MIGRATION);
        TableMigrationRequest capped = guard.applyMigrationTrialCap(sampleTableRequest(50_000));
        assertEquals(50_000, capped.maxRows());
    }

    @Test
    void backupRequiresPackWhenLocked() {
        properties.setMode("enforced");
        assertTrue(!guard.isBackupEntitled());
        PackEntitlementException ex = assertThrows(PackEntitlementException.class, guard::requireBackupPack);
        assertEquals(DatawiseErrorCodes.LICENSE_REQUIRED, ex.errorCode());
        assertEquals(PackIds.BACKUP, ex.packId());
    }

    @Test
    void backupPassesWhenOpen() {
        properties.setMode("open");
        assertTrue(guard.isBackupEntitled());
        guard.requireBackupPack();
    }

    @Test
    void backupPassesWhenTrialStarted() {
        properties.setMode("enforced");
        entitlementService.startTrial(PackIds.BACKUP);
        assertTrue(guard.isBackupEntitled());
        guard.requireBackupPack();
    }

    private static TableMigrationRequest sampleTableRequest(Integer maxRows) {
        return new TableMigrationRequest(
                "src", "db", "tgt", "db", "t",
                null, null, null, null, 500, 0,
                false, false, null, null, null, maxRows
        );
    }

    private static TableMigrationBatchRequest sampleBatchRequest(Integer maxRows) {
        return new TableMigrationBatchRequest(
                "src", "db", "tgt", "db", List.of(),
                null, null, null, null, 500, 0,
                false, null, null, null, maxRows
        );
    }
}
