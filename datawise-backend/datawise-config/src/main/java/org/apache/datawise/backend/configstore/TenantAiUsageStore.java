package org.apache.datawise.backend.configstore;

import java.util.LinkedHashMap;
import java.util.Map;

/** Per-tenant daily AI call counter (file or jdbc backend). */
public interface TenantAiUsageStore {

    AiUsageSnapshot read(String tenantId);

    void write(String tenantId, AiUsageSnapshot usage);

    final class AiUsageSnapshot {

        public String day;
        public int calls;
        /** Capability id → calls today (Wave 29). */
        public Map<String, Integer> byCapability = new LinkedHashMap<>();

        public AiUsageSnapshot() {
        }

        public AiUsageSnapshot(String day, int calls) {
            this(day, calls, Map.of());
        }

        public AiUsageSnapshot(String day, int calls, Map<String, Integer> byCapability) {
            this.day = day;
            this.calls = calls;
            this.byCapability = byCapability != null
                    ? new LinkedHashMap<>(byCapability)
                    : new LinkedHashMap<>();
        }
    }
}
