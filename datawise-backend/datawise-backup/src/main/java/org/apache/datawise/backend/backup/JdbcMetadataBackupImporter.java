package org.apache.datawise.backend.backup;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ApiTokenStore;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.OidcConfigStore;
import org.apache.datawise.backend.configstore.OidcConfigStore.StoredOidcConfig;
import org.apache.datawise.backend.configstore.OutboundWebhookStore;
import org.apache.datawise.backend.configstore.SessionStore;
import org.apache.datawise.backend.configstore.SqlHistoryStore;
import org.apache.datawise.backend.configstore.TenantAiUsageStore;
import org.apache.datawise.backend.configstore.TenantAiUsageStore.AiUsageSnapshot;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.configstore.jdbc.JdbcConnectionStore;
import org.apache.datawise.backend.configstore.jdbc.JdbcOidcConfigStore;
import org.apache.datawise.backend.configstore.jdbc.JdbcOutboundWebhookStore;
import org.apache.datawise.backend.configstore.jdbc.JdbcSqlHistoryStore;
import org.apache.datawise.backend.configstore.jdbc.JdbcTeamStore;
import org.apache.datawise.backend.configstore.jdbc.MetadataJdbcConfiguration;
import org.apache.datawise.backend.configstore.team.TeamSnapshot;
import org.apache.datawise.backend.model.ApiTokenEntity;
import org.apache.datawise.backend.model.OutboundWebhookEntity;
import org.apache.datawise.backend.model.SessionEntity;
import org.apache.datawise.backend.model.SqlHistoryEntity;
import org.apache.datawise.backend.model.TenantEntity;
import org.apache.datawise.backend.model.TenantRoleEntity;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.model.UserTenantMembership;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Applies workbench {@code metadata/{table}.json} dumps into the JDBC metadata store.
 * Prefers store APIs so in-memory caches stay consistent.
 */
@Component
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class JdbcMetadataBackupImporter {

    private static final Logger log = LoggerFactory.getLogger(JdbcMetadataBackupImporter.class);
    private static final TypeReference<List<Map<String, Object>>> ROW_LIST =
            new TypeReference<>() {
            };
    private static final TypeReference<Map<String, Boolean>> BOOL_MAP =
            new TypeReference<>() {
            };
    private static final TypeReference<List<String>> STRING_LIST =
            new TypeReference<>() {
            };
    private static final TypeReference<Map<String, Integer>> INT_MAP =
            new TypeReference<>() {
            };
    private static final TypeReference<List<OutboundWebhookEntity>> WEBHOOK_LIST =
            new TypeReference<>() {
            };

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final UserStore userStore;
    private final SessionStore sessionStore;
    private final TenantStore tenantStore;
    private final ApiTokenStore apiTokenStore;
    private final JdbcTeamStore teamStore;
    private final ConnectionStore connectionStore;
    private final OidcConfigStore oidcConfigStore;
    private final OutboundWebhookStore outboundWebhookStore;
    private final TenantAiUsageStore aiUsageStore;
    private final SqlHistoryStore sqlHistoryStore;

    public JdbcMetadataBackupImporter(
            @Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate jdbc,
            ObjectMapper objectMapper,
            UserStore userStore,
            SessionStore sessionStore,
            TenantStore tenantStore,
            ApiTokenStore apiTokenStore,
            JdbcTeamStore teamStore,
            ConnectionStore connectionStore,
            OidcConfigStore oidcConfigStore,
            OutboundWebhookStore outboundWebhookStore,
            TenantAiUsageStore aiUsageStore,
            SqlHistoryStore sqlHistoryStore
    ) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.userStore = userStore;
        this.sessionStore = sessionStore;
        this.tenantStore = tenantStore;
        this.apiTokenStore = apiTokenStore;
        this.teamStore = teamStore;
        this.connectionStore = connectionStore;
        this.oidcConfigStore = oidcConfigStore;
        this.outboundWebhookStore = outboundWebhookStore;
        this.aiUsageStore = aiUsageStore;
        this.sqlHistoryStore = sqlHistoryStore;
    }

    public void apply(Path metadataDir, boolean includeSqlHistory) throws IOException {
        if (metadataDir == null || !Files.isDirectory(metadataDir)) {
            return;
        }
        log.info("Applying JDBC metadata restore from {}", metadataDir);
        // Preflight all artifacts before clearing so a corrupt/missing dump cannot wipe live tables.
        preflightImportFiles(metadataDir, includeSqlHistory);
        // Store-backed imports use separate connections; atomicity is best-effort after preflight.
        clearTables(includeSqlHistory);

        importUsers(readRows(metadataDir, "dw_users"));
        importTenants(readRows(metadataDir, "dw_tenants"));
        importRoles(readRows(metadataDir, "dw_tenant_roles"));
        importMemberships(readRows(metadataDir, "dw_tenant_memberships"));
        importSessions(readRows(metadataDir, "dw_sessions"));
        importApiTokens(readRows(metadataDir, "dw_api_tokens"));
        importTeamSnapshots(readRows(metadataDir, "dw_team_snapshots"));
        importConnectionSnapshots(readRows(metadataDir, "dw_connection_snapshots"));
        importOidc(readRows(metadataDir, "dw_oidc_configs"));
        importOutboundWebhooks(readRows(metadataDir, "dw_outbound_webhook_snapshots"));
        importAiUsage(readRows(metadataDir, "dw_tenant_ai_usage"));
        if (includeSqlHistory) {
            importSqlHistory(readRows(metadataDir, JdbcMetadataBackupTables.SQL_HISTORY));
        }
        log.info("JDBC metadata restore complete");
    }

    private void preflightImportFiles(Path metadataDir, boolean includeSqlHistory) throws IOException {
        for (String table : JdbcMetadataBackupTables.CORE_TABLES) {
            requireReadableRowFile(metadataDir, table);
        }
        if (includeSqlHistory) {
            requireReadableRowFile(metadataDir, JdbcMetadataBackupTables.SQL_HISTORY);
        }
    }

    private void requireReadableRowFile(Path metadataDir, String table) throws IOException {
        Path file = metadataDir.resolve(table + ".json");
        if (!Files.isRegularFile(file)) {
            throw new IllegalArgumentException("metadata restore preflight failed: missing table dump " + table);
        }
        try {
            List<Map<String, Object>> rows = objectMapper.readValue(file.toFile(), ROW_LIST);
            if (rows == null) {
                throw new IllegalArgumentException("metadata restore preflight failed: corrupt table dump " + table);
            }
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("metadata restore preflight failed: corrupt table dump " + table, ex);
        }
    }

    private void clearTables(boolean includeSqlHistory) {
        for (String table : JdbcMetadataBackupTables.CLEAR_ORDER) {
            if (!includeSqlHistory && JdbcMetadataBackupTables.SQL_HISTORY.equals(table)) {
                continue;
            }
            jdbc.update("DELETE FROM " + table);
        }
    }

    private List<Map<String, Object>> readRows(Path metadataDir, String table) throws IOException {
        Path file = metadataDir.resolve(table + ".json");
        if (!Files.isRegularFile(file)) {
            return List.of();
        }
        List<Map<String, Object>> rows = objectMapper.readValue(file.toFile(), ROW_LIST);
        return rows != null ? rows : List.of();
    }

    private void importUsers(List<Map<String, Object>> rows) {
        for (Map<String, Object> row : rows) {
            UserEntity user = new UserEntity();
            user.setId(asLong(row.get("id")));
            user.setUsername(asString(row.get("username")));
            user.setPasswordHash(asString(row.get("password_hash")));
            user.setDisplayName(asString(row.get("display_name")));
            user.setEmail(asString(row.get("email")));
            user.setGuest(asBoolean(row.get("guest")));
            user.setFeaturePermissions(readBoolMap(row.get("feature_permissions")));
            user.setCreatedAt(asInstant(row.get("created_at")));
            user.setUpdatedAt(asInstant(row.get("updated_at")));
            if (user.getId() != null) {
                userStore.saveUser(user);
            }
        }
    }

    private void importTenants(List<Map<String, Object>> rows) {
        for (Map<String, Object> row : rows) {
            TenantEntity tenant = new TenantEntity();
            tenant.setId(asString(row.get("id")));
            tenant.setSlug(asString(row.get("slug")));
            tenant.setName(asString(row.get("name")));
            tenant.setStatus(asString(row.get("status")));
            tenant.setCreatedAt(asInstant(row.get("created_at")));
            tenant.setUpdatedAt(asInstant(row.get("updated_at")));
            if (tenant.getId() != null) {
                tenantStore.saveTenant(tenant);
            }
        }
    }

    private void importRoles(List<Map<String, Object>> rows) {
        for (Map<String, Object> row : rows) {
            TenantRoleEntity role = new TenantRoleEntity();
            role.setId(asString(row.get("id")));
            role.setTenantId(asString(row.get("tenant_id")));
            role.setKey(asString(row.get("role_key")));
            role.setName(asString(row.get("name")));
            role.setPermissions(readBoolMap(row.get("permissions")));
            role.setSystem(asBoolean(row.get("system_role")));
            if (role.getId() != null && role.getTenantId() != null) {
                tenantStore.saveRole(role);
            }
        }
    }

    private void importMemberships(List<Map<String, Object>> rows) {
        for (Map<String, Object> row : rows) {
            UserTenantMembership membership = new UserTenantMembership();
            membership.setUserId(asLong(row.get("user_id")));
            membership.setTenantId(asString(row.get("tenant_id")));
            membership.setStatus(asString(row.get("status")));
            membership.setRoleIds(readStringList(row.get("role_ids")));
            membership.setJoinedAt(asInstant(row.get("joined_at")));
            if (membership.getUserId() != null && membership.getTenantId() != null) {
                tenantStore.saveMembership(membership);
            }
        }
    }

    private void importSessions(List<Map<String, Object>> rows) {
        for (Map<String, Object> row : rows) {
            SessionEntity session = new SessionEntity();
            session.setId(asString(row.get("id")));
            session.setUserId(asLong(row.get("user_id")));
            session.setGuest(asBoolean(row.get("guest")));
            session.setTenantId(asString(row.get("tenant_id")));
            session.setExpiresAt(asInstant(row.get("expires_at")));
            session.setCreatedAt(asInstant(row.get("created_at")));
            if (session.getId() != null) {
                sessionStore.save(session);
            }
        }
    }

    private void importApiTokens(List<Map<String, Object>> rows) {
        for (Map<String, Object> row : rows) {
            ApiTokenEntity token = new ApiTokenEntity();
            token.setId(asString(row.get("id")));
            token.setName(asString(row.get("name")));
            token.setUserId(asLong(row.get("user_id")));
            token.setTenantId(asString(row.get("tenant_id")));
            token.setTokenHash(asString(row.get("token_hash")));
            token.setTokenLookup(asString(row.get("token_lookup")));
            token.setScopes(readStringList(row.get("scopes")));
            token.setCreatedAt(asInstant(row.get("created_at")));
            token.setLastUsedAt(asInstant(row.get("last_used_at")));
            if (token.getId() != null) {
                apiTokenStore.save(token);
            }
        }
    }

    private void importTeamSnapshots(List<Map<String, Object>> rows) {
        for (Map<String, Object> row : rows) {
            String tenantId = asString(row.get("tenant_id"));
            String payload = asString(row.get("payload"));
            if (tenantId == null || payload == null || payload.isBlank()) {
                continue;
            }
            try {
                TeamSnapshot snapshot = objectMapper.readValue(payload, TeamSnapshot.class);
                teamStore.replaceSnapshot(tenantId, snapshot != null ? snapshot : TeamSnapshot.empty());
            } catch (Exception ex) {
                throw new IllegalStateException("Failed to restore team snapshot for tenant " + tenantId, ex);
            }
        }
    }

    private void importConnectionSnapshots(List<Map<String, Object>> rows) {
        if (!(connectionStore instanceof JdbcConnectionStore jdbcConnectionStore)) {
            return;
        }
        for (Map<String, Object> row : rows) {
            String tenantId = asString(row.get("tenant_id"));
            String payload = asString(row.get("payload"));
            if (tenantId == null || payload == null) {
                continue;
            }
            jdbcConnectionStore.replaceXmlPayload(tenantId, payload);
        }
    }

    private void importOidc(List<Map<String, Object>> rows) {
        if (!(oidcConfigStore instanceof JdbcOidcConfigStore jdbcOidc)) {
            return;
        }
        for (Map<String, Object> row : rows) {
            String tenantId = asString(row.get("tenant_id"));
            String payload = asString(row.get("payload"));
            if (tenantId == null) {
                continue;
            }
            try {
                StoredOidcConfig stored = payload == null || payload.isBlank()
                        ? StoredOidcConfig.disabledDefaults()
                        : objectMapper.readValue(payload, StoredOidcConfig.class);
                jdbcOidc.saveForTenant(tenantId, stored != null ? stored : StoredOidcConfig.disabledDefaults());
            } catch (Exception ex) {
                throw new IllegalStateException("Failed to restore oidc for tenant " + tenantId, ex);
            }
        }
    }

    private void importOutboundWebhooks(List<Map<String, Object>> rows) {
        if (!(outboundWebhookStore instanceof JdbcOutboundWebhookStore jdbcHooks)) {
            return;
        }
        for (Map<String, Object> row : rows) {
            String tenantId = asString(row.get("tenant_id"));
            String payload = asString(row.get("payload"));
            if (tenantId == null) {
                continue;
            }
            try {
                List<OutboundWebhookEntity> hooks = payload == null || payload.isBlank()
                        ? List.of()
                        : objectMapper.readValue(payload, WEBHOOK_LIST);
                jdbcHooks.replaceAll(tenantId, hooks != null ? hooks : List.of());
            } catch (Exception ex) {
                throw new IllegalStateException("Failed to restore outbound webhooks for tenant " + tenantId, ex);
            }
        }
    }

    private void importAiUsage(List<Map<String, Object>> rows) {
        for (Map<String, Object> row : rows) {
            String tenantId = asString(row.get("tenant_id"));
            if (tenantId == null) {
                continue;
            }
            AiUsageSnapshot usage = new AiUsageSnapshot(
                    asString(row.get("usage_day")),
                    asInt(row.get("call_count")),
                    readIntMap(row.get("capability_json"))
            );
            aiUsageStore.write(tenantId, usage);
        }
    }

    private void importSqlHistory(List<Map<String, Object>> rows) {
        List<SqlHistoryEntity> entries = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            SqlHistoryEntity entity = new SqlHistoryEntity();
            entity.setId(asString(row.get("id")));
            entity.setUserId(asLong(row.get("user_id")));
            entity.setTenantId(asString(row.get("tenant_id")));
            entity.setConnectionId(asString(row.get("connection_id")));
            entity.setDatabase(asString(row.get("database_name")));
            entity.setSqlText(asString(row.get("sql_text")));
            entity.setDurationMs(asLong(row.get("duration_ms")));
            Integer rowCount = asInteger(row.get("row_count"));
            entity.setRowCount(rowCount);
            entity.setStatus(asString(row.get("status")));
            entity.setExecutedAt(asInstant(row.get("executed_at")));
            if (entity.getId() != null) {
                entries.add(entity);
            }
        }
        if (sqlHistoryStore instanceof JdbcSqlHistoryStore jdbcHistory) {
            jdbcHistory.replaceAll(entries);
        } else {
            for (SqlHistoryEntity entry : entries) {
                sqlHistoryStore.save(entry);
            }
        }
    }

    private Map<String, Boolean> readBoolMap(Object raw) {
        if (raw == null) {
            return null;
        }
        try {
            if (raw instanceof Map<?, ?> map) {
                Map<String, Boolean> out = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    if (entry.getKey() != null) {
                        out.put(entry.getKey().toString(), asBoolean(entry.getValue()));
                    }
                }
                return out;
            }
            String json = raw.toString();
            if (json.isBlank()) {
                return null;
            }
            return objectMapper.readValue(json, BOOL_MAP);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to parse boolean map", ex);
        }
    }

    private List<String> readStringList(Object raw) {
        if (raw == null) {
            return List.of();
        }
        try {
            if (raw instanceof List<?> list) {
                List<String> out = new ArrayList<>();
                for (Object item : list) {
                    if (item != null) {
                        out.add(item.toString());
                    }
                }
                return out;
            }
            String json = raw.toString();
            if (json.isBlank()) {
                return List.of();
            }
            List<String> parsed = objectMapper.readValue(json, STRING_LIST);
            return parsed != null ? parsed : List.of();
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to parse string list", ex);
        }
    }

    private Map<String, Integer> readIntMap(Object raw) {
        if (raw == null) {
            return Map.of();
        }
        try {
            if (raw instanceof Map<?, ?> map) {
                Map<String, Integer> out = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    if (entry.getKey() != null) {
                        Integer value = asInteger(entry.getValue());
                        if (value != null) {
                            out.put(entry.getKey().toString(), value);
                        }
                    }
                }
                return out;
            }
            String json = raw.toString();
            if (json.isBlank()) {
                return Map.of();
            }
            Map<String, Integer> parsed = objectMapper.readValue(json, INT_MAP);
            return parsed != null ? parsed : Map.of();
        } catch (Exception ex) {
            return Map.of();
        }
    }

    private static String asString(Object value) {
        return value == null ? null : value.toString();
    }

    private static Long asLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        String text = value.toString().trim();
        if (text.isEmpty()) {
            return null;
        }
        return Long.parseLong(text);
    }

    private static Integer asInteger(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        String text = value.toString().trim();
        if (text.isEmpty()) {
            return null;
        }
        return Integer.parseInt(text);
    }

    private static int asInt(Object value) {
        Integer parsed = asInteger(value);
        return parsed != null ? parsed : 0;
    }

    private static boolean asBoolean(Object value) {
        if (value == null) {
            return false;
        }
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof Number number) {
            return number.intValue() != 0;
        }
        return Boolean.parseBoolean(value.toString()) || "1".equals(value.toString());
    }

    private static Instant asInstant(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Instant instant) {
            return instant;
        }
        if (value instanceof Timestamp timestamp) {
            return timestamp.toInstant();
        }
        if (value instanceof Number number) {
            return Instant.ofEpochMilli(number.longValue());
        }
        String text = value.toString().trim();
        if (text.isEmpty()) {
            return null;
        }
        return Instant.parse(text);
    }
}
