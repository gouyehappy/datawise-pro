package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.TenantAiUsageStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class JdbcTenantAiUsageStore implements TenantAiUsageStore {

    private static final TypeReference<Map<String, Integer>> CAPABILITY_MAP =
            new TypeReference<>() {
            };

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public JdbcTenantAiUsageStore(@Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate jdbc) {
        this(jdbc, new ObjectMapper());
    }

    public JdbcTenantAiUsageStore(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
    }

    @Override
    public AiUsageSnapshot read(String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        List<AiUsageSnapshot> rows = jdbc.query(
                "SELECT usage_day, call_count, capability_json FROM dw_tenant_ai_usage WHERE tenant_id = ?",
                (rs, rowNum) -> new AiUsageSnapshot(
                        rs.getString("usage_day"),
                        rs.getInt("call_count"),
                        parseCapabilityJson(rs.getString("capability_json"))),
                id);
        if (rows.isEmpty()) {
            return emptyToday();
        }
        AiUsageSnapshot stored = rows.get(0);
        return stored.day != null ? stored : emptyToday();
    }

    @Override
    public synchronized void write(String tenantId, AiUsageSnapshot usage) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        AiUsageSnapshot next = usage != null ? usage : emptyToday();
        String day = next.day != null && !next.day.isBlank()
                ? next.day
                : LocalDate.now(ZoneId.systemDefault()).toString();
        int calls = Math.max(0, next.calls);
        String capabilityJson = toCapabilityJson(next.byCapability);
        Timestamp now = Timestamp.from(Instant.now());
        int updated = jdbc.update(
                "UPDATE dw_tenant_ai_usage SET usage_day = ?, call_count = ?, capability_json = ?, updated_at = ? WHERE tenant_id = ?",
                day, calls, capabilityJson, now, id);
        if (updated == 0) {
            jdbc.update(
                    "INSERT INTO dw_tenant_ai_usage (tenant_id, usage_day, call_count, capability_json, updated_at) VALUES (?,?,?,?,?)",
                    id, day, calls, capabilityJson, now);
        }
    }

    private Map<String, Integer> parseCapabilityJson(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            Map<String, Integer> map = objectMapper.readValue(json, CAPABILITY_MAP);
            return map != null ? map : Map.of();
        } catch (Exception ex) {
            return Map.of();
        }
    }

    private String toCapabilityJson(Map<String, Integer> byCapability) {
        if (byCapability == null || byCapability.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(new LinkedHashMap<>(byCapability));
        } catch (Exception ex) {
            return null;
        }
    }

    private static AiUsageSnapshot emptyToday() {
        return new AiUsageSnapshot(LocalDate.now(ZoneId.systemDefault()).toString(), 0);
    }
}
