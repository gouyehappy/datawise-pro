package org.apache.datawise.backend.server.pack;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.config.EntitlementProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.domain.pack.EntitlementSnapshotDto;
import org.apache.datawise.backend.domain.pack.PackAccessState;
import org.apache.datawise.backend.domain.pack.PackAuditActions;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.apache.datawise.backend.domain.pack.PackRuntimeStatusDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EntitlementServiceTest {

    @TempDir
    Path tempDir;

    private EntitlementProperties properties;
    private EntitlementService service;
    private PackAuditService auditService;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        properties = new EntitlementProperties();
        properties.setSigningSecret("test-secret");
        properties.setTrialDays(7);
        PackStateStore store = new PackStateStore(new ConfigDirectoryService(tempDir), mapper);
        auditService = new PackAuditService(store);
        service = new EntitlementService(properties, store, mapper, auditService);
    }

    @Test
    void openModeGrantsAllPacks() {
        properties.setMode("open");
        EntitlementSnapshotDto snapshot = service.currentSnapshot();
        assertEquals("open", snapshot.mode());
        assertTrue(service.isPackUsable(PackIds.AI));
        assertTrue(service.isPackUsable(PackIds.CONNECTOR_DOMESTIC));
        assertEquals(PackIds.ALL.size(), snapshot.packs().size());
    }

    @Test
    void enforcedLocksUntilTrialOrLicense() {
        properties.setMode("enforced");
        assertFalse(service.isPackUsable(PackIds.AI));
        assertEquals(PackAccessState.LOCKED, stateOf(service.currentSnapshot(), PackIds.AI));

        service.startTrial(PackIds.AI);
        assertTrue(service.isPackUsable(PackIds.AI));
        assertEquals(PackAccessState.TRIAL, stateOf(service.currentSnapshot(), PackIds.AI));
    }

    @Test
    void trialCannotBeRepeatedAfterExpiryConsumed() {
        properties.setMode("enforced");
        service.startTrial(PackIds.MIGRATION);
        // second call while active is idempotent
        service.startTrial(PackIds.MIGRATION);
        assertTrue(service.isPackUsable(PackIds.MIGRATION));
    }

    @Test
    void activateLicenseUnlocksPacks() {
        properties.setMode("enforced");
        String key = service.issueDevLicense(
                List.of(PackIds.BACKUP, PackIds.SECURITY),
                Instant.now().plus(60, ChronoUnit.DAYS).toString(),
                null
        );
        EntitlementSnapshotDto snapshot = service.activateLicense(key);
        assertTrue(service.isPackUsable(PackIds.BACKUP));
        assertTrue(service.isPackUsable(PackIds.SECURITY));
        assertFalse(service.isPackUsable(PackIds.AI));
        assertFalse(Boolean.TRUE.equals(snapshot.metaDocUsable()));
    }

    @Test
    void suiteEnterpriseExpandsPacksAndUnlocksMetaDoc() {
        properties.setMode("enforced");
        String key = service.issueDevLicense(
                List.of(PackIds.AI),
                Instant.now().plus(60, ChronoUnit.DAYS).toString(),
                "suite.enterprise"
        );
        EntitlementSnapshotDto snapshot = service.activateLicense(key);
        assertEquals("suite.enterprise", snapshot.suiteId());
        assertTrue(Boolean.TRUE.equals(snapshot.metaDocUsable()));
        assertTrue(service.isMetaDocUsable());
        assertTrue(service.isPackUsable(PackIds.GOVERNANCE));
        assertTrue(service.isPackUsable(PackIds.LINEAGE));
        assertTrue(service.isPackUsable(PackIds.DATAOPS));
        assertFalse(service.isPackUsable(PackIds.DATAGEN));
    }

    @Test
    void proSuiteDoesNotUnlockMetaDoc() {
        properties.setMode("enforced");
        String key = service.issueDevLicense(
                List.of(PackIds.AI),
                Instant.now().plus(60, ChronoUnit.DAYS).toString(),
                "suite.pro"
        );
        service.activateLicense(key);
        assertTrue(service.isPackUsable(PackIds.GOVERNANCE));
        assertFalse(service.isMetaDocUsable());
        assertThrows(PackEntitlementException.class, service::requireMetaDoc);
    }

    @Test
    void requireConnectorBlocksPaidConnectorWhenLocked() {
        properties.setMode("enforced");
        assertThrows(PackEntitlementException.class, () -> service.requireConnector("oracle"));
        // free connectors pass
        service.requireConnector("mysql");
    }

    @Test
    void openModeDoesNotBlockConnectors() {
        properties.setMode("open");
        service.requireConnector("oracle");
        service.requireConnector("dm");
    }

    @Test
    void enforcedSnapshotReportsFreeAiRemainingWhenAiLocked() {
        properties.setMode("enforced");
        properties.setFreeAiCallsDailyLimit(5);
        EntitlementSnapshotDto snapshot = service.currentSnapshot();
        assertEquals(5, snapshot.freeAiCallsRemaining());
        assertEquals(5, snapshot.freeAiCallsDailyLimit());
    }

    @Test
    void activateAndRejectAreAudited() {
        properties.setMode("enforced");
        assertThrows(PackEntitlementException.class, () -> service.activateLicense("not-a-license"));
        assertTrue(auditService.listRecent(10).stream()
                .anyMatch(e -> PackAuditActions.LICENSE_REJECTED.equals(e.action())
                        || PackAuditActions.LICENSE_TAMPERED.equals(e.action())));

        String key = service.issueDevLicense(
                List.of(PackIds.AI),
                Instant.now().plus(30, ChronoUnit.DAYS).toString(),
                null
        );
        service.activateLicense(key);
        assertTrue(auditService.listRecent(10).stream()
                .anyMatch(e -> PackAuditActions.LICENSE_ACTIVATED.equals(e.action())));
        assertNotNull(service.currentSnapshot().watermarkFooter());
    }

    private static String stateOf(EntitlementSnapshotDto snapshot, String packId) {
        return snapshot.packs().stream()
                .filter(entry -> packId.equals(entry.packId()))
                .map(PackRuntimeStatusDto::state)
                .findFirst()
                .orElse("missing");
    }
}
