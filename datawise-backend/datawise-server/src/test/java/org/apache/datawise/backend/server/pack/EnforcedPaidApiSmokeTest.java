package org.apache.datawise.backend.server.pack;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.config.EntitlementProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Wave 18 smoke: enforced mode blocks paid packs until trial/license.
 */
class EnforcedPaidApiSmokeTest {

    @TempDir
    Path tempDir;

    private EntitlementProperties properties;
    private EntitlementService entitlementService;
    private MigrationBackupAccessGuard migrationBackupAccessGuard;

    @BeforeEach
    void setUp() {
        properties = new EntitlementProperties();
        properties.setMode("enforced");
        properties.setSigningSecret("test-secret");
        properties.setTrialDays(7);
        PackStateStore store = new PackStateStore(new ConfigDirectoryService(tempDir), new ObjectMapper());
        PackAuditService audit = new PackAuditService(store);
        entitlementService = new EntitlementService(properties, store, new ObjectMapper(), audit);
        migrationBackupAccessGuard = new MigrationBackupAccessGuard(entitlementService, properties);
    }

    @Test
    void enforcedBlocksCapabilityPacks() {
        for (String packId : List.of(
                PackIds.AI,
                PackIds.GOVERNANCE,
                PackIds.SECURITY,
                PackIds.DATAGEN,
                PackIds.DATAOPS,
                PackIds.LINEAGE,
                PackIds.BACKUP,
                PackIds.MIGRATION
        )) {
            PackEntitlementException ex = assertThrows(
                    PackEntitlementException.class,
                    () -> entitlementService.requirePack(packId)
            );
            assertEquals(DatawiseErrorCodes.LICENSE_REQUIRED, ex.errorCode());
        }
    }

    @Test
    void enforcedBlocksMetaDocAndBackup() {
        PackEntitlementException meta = assertThrows(
                PackEntitlementException.class,
                () -> entitlementService.requireMetaDoc()
        );
        assertEquals(DatawiseErrorCodes.LICENSE_REQUIRED, meta.errorCode());

        PackEntitlementException backup = assertThrows(
                PackEntitlementException.class,
                migrationBackupAccessGuard::requireBackupPack
        );
        assertEquals(DatawiseErrorCodes.LICENSE_REQUIRED, backup.errorCode());
    }

    @Test
    void enforcedBlocksConnectorPacks() {
        for (String packId : List.of(
                PackIds.CONNECTOR_ENTERPRISE,
                PackIds.CONNECTOR_DOMESTIC,
                PackIds.CONNECTOR_BIGDATA
        )) {
            PackEntitlementException ex = assertThrows(
                    PackEntitlementException.class,
                    () -> entitlementService.requirePack(packId)
            );
            assertEquals(DatawiseErrorCodes.LICENSE_REQUIRED, ex.errorCode());
        }
    }

    @Test
    void trialThenRequirePackSucceeds() {
        entitlementService.startTrial(PackIds.GOVERNANCE);
        entitlementService.requirePack(PackIds.GOVERNANCE);
    }
}
