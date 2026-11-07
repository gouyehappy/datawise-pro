package org.apache.datawise.backend.server.pack;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.config.EntitlementProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.domain.pack.EntitlementSnapshotDto;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiAccessGuardTest {

    @TempDir
    Path tempDir;

    private EntitlementProperties properties;
    private EntitlementService entitlementService;
    private AiAccessGuard guard;

    @BeforeEach
    void setUp() {
        properties = new EntitlementProperties();
        properties.setSigningSecret("test-secret");
        properties.setTrialDays(7);
        properties.setFreeAiCallsDailyLimit(3);
        ObjectMapper mapper = new ObjectMapper();
        PackStateStore store = new PackStateStore(new ConfigDirectoryService(tempDir), mapper);
        entitlementService = new EntitlementService(properties, store, mapper, new PackAuditService(store));
        guard = new AiAccessGuard(entitlementService, properties, store);
    }

    @Test
    void openModeDoesNotConsumeFreeQuota() {
        properties.setMode("open");
        assertTrue(guard.requireAiCallAccess());
        assertTrue(guard.requireAiCallAccess());
        assertTrue(guard.requireAiCallAccess());
        assertTrue(guard.requireAiCallAccess());
        assertEquals(-1, guard.freeAiCallsRemaining());
        assertNull(entitlementService.currentSnapshot().freeAiCallsRemaining());
    }

    @Test
    void enforcedAllowsFreeCallsThenQuotaExceeded() {
        properties.setMode("enforced");
        assertFalse(entitlementService.isPackUsable(PackIds.AI));

        assertFalse(guard.requireAiCallAccess());
        assertFalse(guard.requireAiCallAccess());
        assertFalse(guard.requireAiCallAccess());

        EntitlementSnapshotDto snapshot = entitlementService.currentSnapshot();
        assertEquals(0, snapshot.freeAiCallsRemaining());

        PackEntitlementException ex = assertThrows(PackEntitlementException.class, guard::requireAiCallAccess);
        assertEquals(DatawiseErrorCodes.QUOTA_EXCEEDED, ex.errorCode());
    }

    @Test
    void trialUnlocksUnlimitedRelativeToFreeGate() {
        properties.setMode("enforced");
        entitlementService.startTrial(PackIds.AI);
        assertTrue(guard.requireAiCallAccess());
        assertTrue(guard.requireAiCallAccess());
        assertTrue(guard.requireAiCallAccess());
        assertTrue(guard.requireAiCallAccess());
        assertEquals(-1, guard.freeAiCallsRemaining());
    }

    @Test
    void ragRequiresPackWhenLocked() {
        properties.setMode("enforced");
        PackEntitlementException ex = assertThrows(PackEntitlementException.class, guard::requireAiPack);
        assertEquals(DatawiseErrorCodes.LICENSE_REQUIRED, ex.errorCode());
    }
}
