package org.apache.datawise.backend.service.tenant;

import org.apache.datawise.backend.common.PackEntitlementException;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.TenantAiUsageStore;
import org.apache.datawise.backend.configstore.TenantAiUsageStore.AiUsageSnapshot;
import org.apache.datawise.backend.domain.AiMeterCapabilities;
import org.apache.datawise.backend.domain.TenantAiUsageDto;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.outbound.OutboundEventSignals;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 租户级硬顶配额：连接数 + 每日 AI 调用（可按 capability 分项累计）。
 */
@Service
public class TenantQuotaService {

    private final TenancyProperties tenancyProperties;
    private final ConnectionStore connectionStore;
    private final TenantAiUsageStore aiUsageStore;
    private final OutboundEventSignals outboundEventSignals;
    /** In-process dedupe for quota outbound (survives JDBC store without extra columns). */
    private final Set<String> nearLimitEmittedKeys = ConcurrentHashMap.newKeySet();
    private final Set<String> exhaustedEmittedKeys = ConcurrentHashMap.newKeySet();

    public TenantQuotaService(
                              TenancyProperties tenancyProperties,
                              ConnectionStore connectionStore,
                              TenantAiUsageStore aiUsageStore,
                              OutboundEventSignals outboundEventSignals) {
        this.tenancyProperties = tenancyProperties;
        this.connectionStore = connectionStore;
        this.aiUsageStore = aiUsageStore;
        this.outboundEventSignals = outboundEventSignals;
    }

    public void requireConnectionQuotaForCreate(String connectionIdBeingSaved) {
        int max = tenancyProperties.getMaxConnectionsPerTenant();
        if (max <= 0) {
            return;
        }
        String tenantId = TenantIds.normalizeOrDefault(UserContext.getTenantId());
        long count = connectionStore.findAllConnections().stream()
                .filter(c -> c != null && tenantMatches(c, tenantId))
                .filter(c -> connectionIdBeingSaved == null
                        || c.getId() == null
                        || !connectionIdBeingSaved.equals(c.getId()))
                .count();
        if (count >= max) {
            throw PackEntitlementException.connectionQuotaExceeded(
                    "Organization connection quota exceeded (" + max + ")");
        }
    }

    /**
     * 计一次 AI 调用（capability={@link AiMeterCapabilities#OTHER}）；
     * 超限抛 {@link PackEntitlementException} / {@code QUOTA_EXCEEDED}（Wave 31）。
     */
    public synchronized void requireAiCallQuota() {
        requireAiCallQuota(AiMeterCapabilities.OTHER);
    }

    /**
     * 计一次指定 capability 的 AI 调用；日总额仍受 {@code maxAiCallsPerTenantPerDay} 限制。
     */
    public synchronized void requireAiCallQuota(String capability) {
        String cap = AiMeterCapabilities.normalize(capability);
        int max = tenancyProperties.getMaxAiCallsPerTenantPerDay();
        if (max <= 0) {
            // still record breakdown when unlimited so operators can inspect usage
            recordUnlimitedCall(cap);
            return;
        }
        String tenantId = TenantIds.normalizeOrDefault(UserContext.getTenantId());
        String today = LocalDate.now(ZoneId.systemDefault()).toString();
        AiUsageSnapshot usage = aiUsageStore.read(tenantId);
        if (!today.equals(usage.day)) {
            usage = new AiUsageSnapshot(today, 0);
        }
        if (usage.calls >= max) {
            emitExhaustedOnce(tenantId, today, Math.max(usage.calls, max), max);
            throw PackEntitlementException.quotaExceeded(
                    "Organization AI daily quota exceeded (" + max + ")");
        }
        int previousCalls = usage.calls;
        Map<String, Integer> byCap = new LinkedHashMap<>(
                usage.byCapability != null ? usage.byCapability : Map.of());
        byCap.merge(cap, 1, Integer::sum);
        usage = new AiUsageSnapshot(today, previousCalls + 1, byCap);
        aiUsageStore.write(tenantId, usage);
        notifyQuotaThresholds(tenantId, today, previousCalls, usage.calls, max);
    }

    private void recordUnlimitedCall(String capability) {
        String tenantId = TenantIds.normalizeOrDefault(UserContext.getTenantId());
        String today = LocalDate.now(ZoneId.systemDefault()).toString();
        AiUsageSnapshot usage = aiUsageStore.read(tenantId);
        if (!today.equals(usage.day)) {
            usage = new AiUsageSnapshot(today, 0);
        }
        Map<String, Integer> byCap = new LinkedHashMap<>(
                usage.byCapability != null ? usage.byCapability : Map.of());
        byCap.merge(capability, 1, Integer::sum);
        aiUsageStore.write(tenantId, new AiUsageSnapshot(today, usage.calls + 1, byCap));
    }

    /** Read-only snapshot of today's AI usage for the current session tenant. */
    public synchronized TenantAiUsageDto currentAiUsage() {
        String tenantId = TenantIds.normalizeOrDefault(UserContext.getTenantId());
        int limit = tenancyProperties.getMaxAiCallsPerTenantPerDay();
        String today = LocalDate.now(ZoneId.systemDefault()).toString();
        AiUsageSnapshot usage = aiUsageStore.read(tenantId);
        int calls = today.equals(usage.day) ? Math.max(0, usage.calls) : 0;
        Map<String, Integer> byCapability = today.equals(usage.day) && usage.byCapability != null
                ? usage.byCapability
                : Map.of();
        boolean unlimited = limit <= 0;
        int remaining = unlimited ? Integer.MAX_VALUE : Math.max(0, limit - calls);
        return new TenantAiUsageDto(
                tenantId,
                today,
                calls,
                unlimited ? 0 : limit,
                remaining,
                unlimited,
                byCapability);
    }

    static boolean isNearLimit(int remaining, int limit) {
        if (limit <= 0 || remaining <= 0) {
            return false;
        }
        return remaining <= 5 || remaining * 10 <= limit;
    }

    private void notifyQuotaThresholds(String tenantId, String day, int previousCalls, int calls, int max) {
        int remainingBefore = Math.max(0, max - previousCalls);
        int remainingAfter = Math.max(0, max - calls);
        boolean wasNear = isNearLimit(remainingBefore, max);
        boolean nowNear = isNearLimit(remainingAfter, max);
        if (nowNear && !wasNear) {
            String key = notifyKey(tenantId, day, "near");
            if (nearLimitEmittedKeys.add(key) && UserContext.getUserId() != null) {
                outboundEventSignals.aiQuotaNearLimit(
                        tenantId != null ? tenantId : "",
                        calls,
                        max,
                        remainingAfter);
            }
        }
        if (remainingAfter == 0) {
            emitExhaustedOnce(tenantId, day, calls, max);
        }
    }

    private void emitExhaustedOnce(String tenantId, String day, int calls, int max) {
        String key = notifyKey(tenantId, day, "exhausted");
        if (!exhaustedEmittedKeys.add(key) || UserContext.getUserId() == null) {
            return;
        }
        outboundEventSignals.aiQuotaExhausted(tenantId != null ? tenantId : "", calls, max);
    }

    private static String notifyKey(String tenantId, String day, String kind) {
        return tenantId + "|" + day + "|" + kind;
    }

    private static boolean tenantMatches(ConnectionEntity connection, String tenantId) {
        String cid = connection.getTenantId();
        if (cid == null || cid.isBlank()) {
            return TenantIds.DEFAULT.equals(tenantId);
        }
        return tenantId.equals(cid.trim());
    }
}
