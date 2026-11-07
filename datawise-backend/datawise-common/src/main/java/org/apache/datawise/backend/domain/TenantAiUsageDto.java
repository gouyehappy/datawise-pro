package org.apache.datawise.backend.domain;

import java.util.Map;

/** Current-session tenant daily AI call usage snapshot. */
public record TenantAiUsageDto(
        String tenantId,
        String day,
        int calls,
        int limit,
        int remaining,
        boolean unlimited,
        Map<String, Integer> byCapability) {

    public TenantAiUsageDto(
                            String tenantId,
                            String day,
                            int calls,
                            int limit,
                            int remaining,
                            boolean unlimited) {
        this(tenantId, day, calls, limit, remaining, unlimited, Map.of());
    }

    public TenantAiUsageDto {
        byCapability = byCapability != null ? Map.copyOf(byCapability) : Map.of();
    }
}
