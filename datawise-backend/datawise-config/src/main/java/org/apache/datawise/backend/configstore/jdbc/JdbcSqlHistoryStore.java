package org.apache.datawise.backend.configstore.jdbc;

import org.apache.datawise.backend.configstore.SqlHistoryLimits;
import org.apache.datawise.backend.configstore.SqlHistoryStore;
import org.apache.datawise.backend.configstore.TenantScopedConfigSupport;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.SqlHistoryEntity;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class JdbcSqlHistoryStore implements SqlHistoryStore {

    private static final RowMapper<SqlHistoryEntity> ROW_MAPPER = (rs, rowNum) -> {
        SqlHistoryEntity entity = new SqlHistoryEntity();
        entity.setId(rs.getString("id"));
        long userId = rs.getLong("user_id");
        entity.setUserId(rs.wasNull() ? null : userId);
        entity.setTenantId(rs.getString("tenant_id"));
        entity.setProjectId(rs.getString("project_id"));
        entity.setConnectionId(rs.getString("connection_id"));
        entity.setDatabase(rs.getString("database_name"));
        entity.setSqlText(rs.getString("sql_text"));
        long duration = rs.getLong("duration_ms");
        entity.setDurationMs(rs.wasNull() ? null : duration);
        int rowCount = rs.getInt("row_count");
        entity.setRowCount(rs.wasNull() ? null : rowCount);
        entity.setStatus(rs.getString("status"));
        Timestamp executedAt = rs.getTimestamp("executed_at");
        entity.setExecutedAt(executedAt != null ? executedAt.toInstant() : null);
        return entity;
    };

    private final JdbcTemplate jdbc;

    public JdbcSqlHistoryStore(@Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<SqlHistoryEntity> findByUserId(Long userId) {
        if (userId == null) {
            return List.of();
        }
        String tenantId = TenantScopedConfigSupport.currentTenantId();
        return jdbc.query(
                "SELECT id, user_id, tenant_id, project_id, connection_id, database_name, sql_text, duration_ms, row_count, status, executed_at "
                        + "FROM dw_sql_history WHERE user_id = ? AND tenant_id = ? ORDER BY executed_at DESC",
                ROW_MAPPER,
                userId,
                tenantId);
    }

    @Override
    public List<SqlHistoryEntity> findByUserIds(List<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return List.of();
        }
        Set<Long> idSet = userIds.stream().filter(id -> id != null).collect(Collectors.toCollection(HashSet::new));
        if (idSet.isEmpty()) {
            return List.of();
        }
        String placeholders = idSet.stream().map(id -> "?").collect(Collectors.joining(","));
        Object[] args = new Object[idSet.size() + 1];
        int i = 0;
        for (Long id : idSet) {
            args[i++] = id;
        }
        args[i] = TenantScopedConfigSupport.currentTenantId();
        return jdbc.query(
                "SELECT id, user_id, tenant_id, project_id, connection_id, database_name, sql_text, duration_ms, row_count, status, executed_at "
                        + "FROM dw_sql_history WHERE user_id IN (" + placeholders + ") AND tenant_id = ? ORDER BY executed_at DESC",
                ROW_MAPPER,
                args);
    }

    @Override
    public synchronized SqlHistoryEntity save(SqlHistoryEntity entity) {
        if (entity == null || entity.getId() == null || entity.getId().isBlank()) {
            throw new IllegalArgumentException("sql history id is required");
        }
        if (entity.getTenantId() == null || entity.getTenantId().isBlank()) {
            entity.setTenantId(TenantScopedConfigSupport.currentTenantId());
        } else {
            entity.setTenantId(TenantIds.normalizeOrDefault(entity.getTenantId()));
        }
        Timestamp executedAt = entity.getExecutedAt() != null
                ? Timestamp.from(entity.getExecutedAt())
                : Timestamp.from(Instant.now());
        int updated = jdbc.update(
                "UPDATE dw_sql_history SET user_id = ?, tenant_id = ?, project_id = ?, connection_id = ?, database_name = ?, sql_text = ?, "
                        + "duration_ms = ?, row_count = ?, status = ?, executed_at = ? WHERE id = ?",
                entity.getUserId(),
                entity.getTenantId(),
                entity.getProjectId(),
                entity.getConnectionId(),
                entity.getDatabase(),
                entity.getSqlText(),
                entity.getDurationMs(),
                entity.getRowCount(),
                entity.getStatus(),
                executedAt,
                entity.getId());
        if (updated == 0) {
            jdbc.update(
                    "INSERT INTO dw_sql_history "
                            + "(id, user_id, tenant_id, project_id, connection_id, database_name, sql_text, duration_ms, row_count, status, executed_at) "
                            + "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    entity.getId(),
                    entity.getUserId(),
                    entity.getTenantId(),
                    entity.getProjectId(),
                    entity.getConnectionId(),
                    entity.getDatabase(),
                    entity.getSqlText(),
                    entity.getDurationMs(),
                    entity.getRowCount(),
                    entity.getStatus(),
                    executedAt);
        }
        trimUserHistory(entity.getUserId(), entity.getTenantId());
        return entity;
    }

    private void trimUserHistory(Long userId, String tenantId) {
        if (userId == null) {
            return;
        }
        String normalizedTenant = TenantIds.normalizeOrDefault(tenantId);
        List<String> keepIds = jdbc.query(
                "SELECT id FROM dw_sql_history WHERE user_id = ? AND tenant_id = ? "
                        + "ORDER BY executed_at DESC LIMIT ?",
                (rs, rowNum) -> rs.getString("id"),
                userId,
                normalizedTenant,
                SqlHistoryLimits.FREE_MAX_ENTRIES);
        if (keepIds.isEmpty()) {
            return;
        }
        Integer total = jdbc.queryForObject(
                "SELECT COUNT(*) FROM dw_sql_history WHERE user_id = ? AND tenant_id = ?",
                Integer.class,
                userId,
                normalizedTenant);
        if (total == null || total <= SqlHistoryLimits.FREE_MAX_ENTRIES) {
            return;
        }
        String placeholders = keepIds.stream().map(id -> "?").collect(Collectors.joining(","));
        Object[] args = new Object[keepIds.size() + 2];
        args[0] = userId;
        args[1] = normalizedTenant;
        for (int i = 0; i < keepIds.size(); i++) {
            args[i + 2] = keepIds.get(i);
        }
        jdbc.update(
                "DELETE FROM dw_sql_history WHERE user_id = ? AND tenant_id = ? AND id NOT IN ("
                        + placeholders + ")",
                args);
    }

    public synchronized void replaceAll(List<SqlHistoryEntity> entries) {
        jdbc.update("DELETE FROM dw_sql_history");
        if (entries == null || entries.isEmpty()) {
            return;
        }
        for (SqlHistoryEntity entity : entries) {
            if (entity != null && entity.getId() != null && !entity.getId().isBlank()) {
                save(entity);
            }
        }
    }
}
