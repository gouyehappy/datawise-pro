package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.TenantEntity;
import org.apache.datawise.backend.model.TenantRoleEntity;
import org.apache.datawise.backend.model.UserTenantMembership;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class JdbcTenantStore implements TenantStore {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public JdbcTenantStore(
                           @Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate jdbc,
                           ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    private RowMapper<TenantEntity> tenantMapper() {
        return (rs, rowNum) -> {
            TenantEntity tenant = new TenantEntity();
            tenant.setId(rs.getString("id"));
            tenant.setSlug(rs.getString("slug"));
            tenant.setName(rs.getString("name"));
            tenant.setStatus(rs.getString("status"));
            Timestamp created = rs.getTimestamp("created_at");
            Timestamp updated = rs.getTimestamp("updated_at");
            if (created != null) {
                tenant.setCreatedAt(created.toInstant());
            }
            if (updated != null) {
                tenant.setUpdatedAt(updated.toInstant());
            }
            return tenant;
        };
    }

    private RowMapper<TenantRoleEntity> roleMapper() {
        return (rs, rowNum) -> {
            TenantRoleEntity role = new TenantRoleEntity();
            role.setId(rs.getString("id"));
            role.setTenantId(rs.getString("tenant_id"));
            role.setKey(rs.getString("role_key"));
            role.setName(rs.getString("name"));
            role.setPermissions(MetadataJsonSupport.readMap(objectMapper, rs.getString("permissions")));
            role.setSystem(rs.getBoolean("system_role"));
            return role;
        };
    }

    private RowMapper<UserTenantMembership> membershipMapper() {
        return (rs, rowNum) -> {
            UserTenantMembership membership = new UserTenantMembership();
            membership.setUserId(rs.getLong("user_id"));
            membership.setTenantId(rs.getString("tenant_id"));
            membership.setStatus(rs.getString("status"));
            membership.setRoleIds(MetadataJsonSupport.readStringList(objectMapper, rs.getString("role_ids")));
            Timestamp joined = rs.getTimestamp("joined_at");
            if (joined != null) {
                membership.setJoinedAt(joined.toInstant());
            }
            return membership;
        };
    }

    @Override
    public List<TenantEntity> listTenants() {
        return jdbc.query("SELECT * FROM dw_tenants ORDER BY id", tenantMapper());
    }

    @Override
    public Optional<TenantEntity> findTenantById(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            return Optional.empty();
        }
        List<TenantEntity> rows = jdbc.query("SELECT * FROM dw_tenants WHERE id = ?", tenantMapper(), tenantId.trim());
        return rows.stream().findFirst();
    }

    @Override
    public synchronized TenantEntity saveTenant(TenantEntity tenant) {
        Objects.requireNonNull(tenant.getId(), "tenant id required");
        Instant now = Instant.now();
        if (tenant.getCreatedAt() == null) {
            tenant.setCreatedAt(now);
        }
        tenant.setUpdatedAt(now);
        int updated = jdbc.update(
                """
                        UPDATE dw_tenants SET slug=?, name=?, status=?, created_at=?, updated_at=? WHERE id=?
                        """,
                tenant.getSlug(),
                tenant.getName(),
                tenant.getStatus(),
                toTimestamp(tenant.getCreatedAt()),
                toTimestamp(tenant.getUpdatedAt()),
                tenant.getId());
        if (updated == 0) {
            jdbc.update(
                    """
                            INSERT INTO dw_tenants (id, slug, name, status, created_at, updated_at)
                            VALUES (?,?,?,?,?,?)
                            """,
                    tenant.getId(),
                    tenant.getSlug(),
                    tenant.getName(),
                    tenant.getStatus(),
                    toTimestamp(tenant.getCreatedAt()),
                    toTimestamp(tenant.getUpdatedAt()));
        }
        return tenant;
    }

    @Override
    public List<TenantRoleEntity> listRoles(String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        return jdbc.query("SELECT * FROM dw_tenant_roles WHERE tenant_id = ? ORDER BY id", roleMapper(), id);
    }

    @Override
    public Optional<TenantRoleEntity> findRoleById(String tenantId, String roleId) {
        if (roleId == null || roleId.isBlank()) {
            return Optional.empty();
        }
        String id = TenantIds.normalizeOrDefault(tenantId);
        List<TenantRoleEntity> rows = jdbc.query(
                "SELECT * FROM dw_tenant_roles WHERE tenant_id = ? AND id = ?",
                roleMapper(),
                id,
                roleId.trim());
        return rows.stream().findFirst();
    }

    @Override
    public Optional<TenantRoleEntity> findRoleByKey(String tenantId, String roleKey) {
        if (roleKey == null || roleKey.isBlank()) {
            return Optional.empty();
        }
        String id = TenantIds.normalizeOrDefault(tenantId);
        List<TenantRoleEntity> rows = jdbc.query(
                "SELECT * FROM dw_tenant_roles WHERE tenant_id = ? AND role_key = ?",
                roleMapper(),
                id,
                roleKey.trim());
        return rows.stream().findFirst();
    }

    @Override
    public synchronized TenantRoleEntity saveRole(TenantRoleEntity role) {
        Objects.requireNonNull(role.getId(), "role id required");
        String tenantId = TenantIds.normalizeOrDefault(role.getTenantId());
        role.setTenantId(tenantId);
        int updated = jdbc.update(
                """
                        UPDATE dw_tenant_roles SET role_key=?, name=?, permissions=?, system_role=?
                        WHERE tenant_id=? AND id=?
                        """,
                role.getKey(),
                role.getName(),
                MetadataJsonSupport.writeMap(objectMapper, role.getPermissions()),
                role.isSystem(),
                tenantId,
                role.getId());
        if (updated == 0) {
            jdbc.update(
                    """
                            INSERT INTO dw_tenant_roles (id, tenant_id, role_key, name, permissions, system_role)
                            VALUES (?,?,?,?,?,?)
                            """,
                    role.getId(),
                    tenantId,
                    role.getKey(),
                    role.getName(),
                    MetadataJsonSupport.writeMap(objectMapper, role.getPermissions()),
                    role.isSystem());
        }
        return role;
    }

    @Override
    public synchronized void deleteRole(String tenantId, String roleId) {
        if (roleId == null || roleId.isBlank()) {
            return;
        }
        jdbc.update(
                "DELETE FROM dw_tenant_roles WHERE tenant_id = ? AND id = ?",
                TenantIds.normalizeOrDefault(tenantId),
                roleId.trim());
    }

    @Override
    public synchronized void replaceRoles(String tenantId, List<TenantRoleEntity> roles) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        jdbc.update("DELETE FROM dw_tenant_roles WHERE tenant_id = ?", id);
        if (roles == null) {
            return;
        }
        for (TenantRoleEntity role : roles) {
            if (role != null) {
                role.setTenantId(id);
                saveRole(role);
            }
        }
    }

    @Override
    public List<UserTenantMembership> listMemberships(String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        return jdbc.query(
                "SELECT * FROM dw_tenant_memberships WHERE tenant_id = ? ORDER BY user_id",
                membershipMapper(),
                id);
    }

    @Override
    public Optional<UserTenantMembership> findMembership(long userId, String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        List<UserTenantMembership> rows = jdbc.query(
                "SELECT * FROM dw_tenant_memberships WHERE user_id = ? AND tenant_id = ?",
                membershipMapper(),
                userId,
                id);
        return rows.stream().findFirst();
    }

    @Override
    public List<UserTenantMembership> listMembershipsForUser(long userId) {
        return jdbc.query(
                "SELECT * FROM dw_tenant_memberships WHERE user_id = ? ORDER BY tenant_id",
                membershipMapper(),
                userId);
    }

    @Override
    public synchronized UserTenantMembership saveMembership(UserTenantMembership membership) {
        Objects.requireNonNull(membership.getUserId(), "userId required");
        String tenantId = TenantIds.normalizeOrDefault(membership.getTenantId());
        membership.setTenantId(tenantId);
        int updated = jdbc.update(
                """
                        UPDATE dw_tenant_memberships SET status=?, role_ids=?, joined_at=?
                        WHERE user_id=? AND tenant_id=?
                        """,
                membership.getStatus(),
                MetadataJsonSupport.writeStringList(objectMapper, membership.getRoleIds()),
                toTimestamp(membership.getJoinedAt()),
                membership.getUserId(),
                tenantId);
        if (updated == 0) {
            jdbc.update(
                    """
                            INSERT INTO dw_tenant_memberships (user_id, tenant_id, status, role_ids, joined_at)
                            VALUES (?,?,?,?,?)
                            """,
                    membership.getUserId(),
                    tenantId,
                    membership.getStatus(),
                    MetadataJsonSupport.writeStringList(objectMapper, membership.getRoleIds()),
                    toTimestamp(membership.getJoinedAt() != null ? membership.getJoinedAt() : Instant.now()));
        }
        return membership;
    }

    @Override
    public synchronized void removeMembership(long userId, String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        jdbc.update("DELETE FROM dw_tenant_memberships WHERE user_id = ? AND tenant_id = ?", userId, id);
    }

    @Override
    public Optional<Map<String, Boolean>> resolveRolePermissions(long userId, String tenantId) {
        Optional<UserTenantMembership> membership = findMembership(userId, tenantId);
        if (membership.isEmpty() || !"active".equalsIgnoreCase(nullToActive(membership.get().getStatus()))) {
            return Optional.empty();
        }
        List<String> roleIds = membership.get().getRoleIds();
        if (roleIds == null || roleIds.isEmpty()) {
            return Optional.empty();
        }
        Map<String, Boolean> aggregated = new LinkedHashMap<>();
        boolean any = false;
        for (String roleId : roleIds) {
            Optional<TenantRoleEntity> role = findRoleById(tenantId, roleId);
            if (role.isEmpty() || role.get().getPermissions() == null) {
                continue;
            }
            any = true;
            for (Map.Entry<String, Boolean> entry : role.get().getPermissions().entrySet()) {
                if (entry.getKey() == null) {
                    continue;
                }
                boolean granted = Boolean.TRUE.equals(entry.getValue());
                aggregated.merge(entry.getKey(), granted, (a, b) -> a || b);
            }
        }
        return any ? Optional.of(aggregated) : Optional.empty();
    }

    @Override
    public boolean hasRoleKey(long userId, String tenantId, String roleKey) {
        Optional<UserTenantMembership> membership = findMembership(userId, tenantId);
        if (membership.isEmpty() || !"active".equalsIgnoreCase(nullToActive(membership.get().getStatus()))) {
            return false;
        }
        List<String> roleIds = membership.get().getRoleIds();
        if (roleIds == null || roleIds.isEmpty()) {
            return false;
        }
        for (String roleId : roleIds) {
            Optional<TenantRoleEntity> role = findRoleById(tenantId, roleId);
            if (role.isPresent() && roleKey.equals(role.get().getKey())) {
                return true;
            }
        }
        return false;
    }

    private static Timestamp toTimestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private static String nullToActive(String status) {
        return status == null || status.isBlank() ? "active" : status;
    }
}
