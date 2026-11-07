package org.apache.datawise.backend.service.tenant;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.FileTenantAiUsageStore;
import org.apache.datawise.backend.domain.AiMeterCapabilities;
import org.apache.datawise.backend.domain.TenantAiUsageDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.outbound.OutboundEventSignals;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TenantQuotaServiceTest {

    @TempDir
    Path tempDir;

    private TenancyProperties properties;
    private TenantQuotaService quotaService;
    private OutboundEventSignals outboundEventSignals;
    private ConnectionStore connectionStore;

    @BeforeEach
    void setUp() {
        properties = new TenancyProperties();
        properties.setMaxAiCallsPerTenantPerDay(2);
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        outboundEventSignals = mock(OutboundEventSignals.class);
        connectionStore = mock(ConnectionStore.class);
        quotaService = new TenantQuotaService(
                properties,
                connectionStore,
                new FileTenantAiUsageStore(configDirectory, new ObjectMapper().findAndRegisterModules()),
                outboundEventSignals);
        UserContext.set(1L, false, "session-1", "default");
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void requireAiCallQuota_enforcesDailyCap() {
        assertDoesNotThrow(() -> quotaService.requireAiCallQuota());
        assertDoesNotThrow(() -> quotaService.requireAiCallQuota());
        PackEntitlementException ex = assertThrows(PackEntitlementException.class, quotaService::requireAiCallQuota);
        assertEquals(DatawiseErrorCodes.QUOTA_EXCEEDED, ex.errorCode());
        assertEquals(429, ex.httpStatus());
    }

    @Test
    void requireAiCallQuota_noopWhenUnlimited() {
        properties.setMaxAiCallsPerTenantPerDay(0);
        assertDoesNotThrow(() -> quotaService.requireAiCallQuota());
        assertDoesNotThrow(() -> quotaService.requireAiCallQuota());
        assertDoesNotThrow(() -> quotaService.requireAiCallQuota());
    }

    @Test
    void currentAiUsage_reportsCallsAndRemaining() {
        assertDoesNotThrow(() -> quotaService.requireAiCallQuota());
        TenantAiUsageDto usage = quotaService.currentAiUsage();
        assertEquals("default", usage.tenantId());
        assertEquals(1, usage.calls());
        assertEquals(2, usage.limit());
        assertEquals(1, usage.remaining());
        assertFalse(usage.unlimited());
    }

    @Test
    void requireAiCallQuota_tracksCapabilityBreakdown() {
        assertDoesNotThrow(() -> quotaService.requireAiCallQuota(AiMeterCapabilities.CHAT));
        assertDoesNotThrow(() -> quotaService.requireAiCallQuota(AiMeterCapabilities.SQL_GENERATE));
        TenantAiUsageDto usage = quotaService.currentAiUsage();
        assertEquals(2, usage.calls());
        assertEquals(1, usage.byCapability().get(AiMeterCapabilities.CHAT));
        assertEquals(1, usage.byCapability().get(AiMeterCapabilities.SQL_GENERATE));
    }

    @Test
    void currentAiUsage_unlimitedWhenLimitZero() {
        properties.setMaxAiCallsPerTenantPerDay(0);
        TenantAiUsageDto usage = quotaService.currentAiUsage();
        assertEquals(0, usage.calls());
        assertEquals(0, usage.limit());
        assertTrue(usage.unlimited());
        assertEquals(Integer.MAX_VALUE, usage.remaining());
    }

    @Test
    void requireAiCallQuota_emitsNearLimitAndExhaustedOnce() {
        properties.setMaxAiCallsPerTenantPerDay(10);
        for (int i = 0; i < 5; i++) {
            assertDoesNotThrow(() -> quotaService.requireAiCallQuota());
        }
        verify(outboundEventSignals, times(1))
                .aiQuotaNearLimit(eq("default"), eq(5), eq(10), eq(5));
        for (int i = 0; i < 5; i++) {
            assertDoesNotThrow(() -> quotaService.requireAiCallQuota());
        }
        verify(outboundEventSignals, times(1))
                .aiQuotaExhausted(eq("default"), eq(10), eq(10));
        assertThrows(PackEntitlementException.class, quotaService::requireAiCallQuota);
        verify(outboundEventSignals, times(1))
                .aiQuotaExhausted(eq("default"), eq(10), eq(10));
        verify(outboundEventSignals, times(1))
                .aiQuotaNearLimit(anyString(), anyInt(), anyInt(), anyInt());
    }

    @Test
    void isNearLimit_matchesFrontendBand() {
        assertTrue(TenantQuotaService.isNearLimit(5, 100));
        assertTrue(TenantQuotaService.isNearLimit(10, 100));
        assertFalse(TenantQuotaService.isNearLimit(11, 100));
        assertFalse(TenantQuotaService.isNearLimit(0, 100));
    }

    @Test
    void requireConnectionQuota_enforcesCapWithStructuredCode() {
        properties.setMaxConnectionsPerTenant(1);
        ConnectionEntity existing = new ConnectionEntity();
        existing.setId("c1");
        existing.setTenantId("default");
        when(connectionStore.findAllConnections()).thenReturn(List.of(existing));

        PackEntitlementException ex = assertThrows(
                PackEntitlementException.class,
                () -> quotaService.requireConnectionQuotaForCreate(null));
        assertEquals(DatawiseErrorCodes.CONNECTION_QUOTA_EXCEEDED, ex.errorCode());
        assertEquals(429, ex.httpStatus());
    }
}
