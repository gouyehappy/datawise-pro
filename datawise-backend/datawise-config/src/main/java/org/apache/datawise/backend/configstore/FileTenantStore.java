package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.TenantEntity;
import org.apache.datawise.backend.model.TenantRoleEntity;
import org.apache.datawise.backend.model.UserTenantMembership;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 租户索引 + 每租户 roles / memberships（文件态）。
 */
@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "file", matchIfMissing = true)
public class FileTenantStore implements TenantStore {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final JsonListFile<TenantEntity> tenantsIndex;
    private final Map<String, JsonListFile<TenantRoleEntity>> rolesByTenant = new ConcurrentHashMap<>();
    private final Map<String, JsonListFile<UserTenantMembership>> membershipsByTenant = new ConcurrentHashMap<>();

    public FileTenantStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.tenantsIndex = new JsonListFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.TENANTS_INDEX,
                new TypeReference<>() {
                });
    }

    @Override
    public List<TenantEntity> listTenants() {
        return tenantsIndex.snapshot();
    }

    @Override
    public Optional<TenantEntity> findTenantById(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            return Optional.empty();
        }
        String id = tenantId.trim();
        return tenantsIndex.stream().filter(t -> id.equals(t.getId())).findFirst();
    }

    @Override
    public synchronized TenantEntity saveTenant(TenantEntity tenant) {
        Objects.requireNonNull(tenant.getId(), "tenant id required");
        return tenantsIndex.upsert(tenant, existing -> tenant.getId().equals(existing.getId()));
    }

    @Override
    public List<TenantRoleEntity> listRoles(String tenantId) {
        return rolesFile(TenantIds.normalizeOrDefault(tenantId)).snapshot();
    }

    @Override
    public Optional<TenantRoleEntity> findRoleById(String tenantId, String roleId) {
        if (roleId == null || roleId.isBlank()) {
            return Optional.empty();
        }
        String id = roleId.trim();
        return listRoles(tenantId).stream().filter(r -> id.equals(r.getId())).findFirst();
    }

    @Override
    public Optional<TenantRoleEntity> findRoleByKey(String tenantId, String roleKey) {
        if (roleKey == null || roleKey.isBlank()) {
            return Optional.empty();
        }
        String key = roleKey.trim();
        return listRoles(tenantId).stream().filter(r -> key.equals(r.getKey())).findFirst();
    }

    @Override
    public synchronized TenantRoleEntity saveRole(TenantRoleEntity role) {
        Objects.requireNonNull(role.getId(), "role id required");
        String tenantId = TenantIds.normalizeOrDefault(role.getTenantId());
        role.setTenantId(tenantId);
        return rolesFile(tenantId).upsert(role, existing -> role.getId().equals(existing.getId()));
    }

    @Override
    public synchronized void deleteRole(String tenantId, String roleId) {
        if (roleId == null || roleId.isBlank()) {
            return;
        }
        String id = roleId.trim();
        rolesFile(TenantIds.normalizeOrDefault(tenantId)).removeIf(existing -> id.equals(existing.getId()));
    }

    @Override
    public synchronized void replaceRoles(String tenantId, List<TenantRoleEntity> roles) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        List<TenantRoleEntity> next = new ArrayList<>();
        if (roles != null) {
            for (TenantRoleEntity role : roles) {
                if (role != null) {
                    role.setTenantId(id);
                    next.add(role);
                }
            }
        }
        rolesFile(id).replaceAll(next);
    }

    @Override
    public List<UserTenantMembership> listMemberships(String tenantId) {
        return membershipsFile(TenantIds.normalizeOrDefault(tenantId)).snapshot();
    }

    @Override
    public Optional<UserTenantMembership> findMembership(long userId, String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        return membershipsFile(id).stream()
                .filter(m -> m.getUserId() != null && m.getUserId() == userId)
                .findFirst();
    }

    @Override
    public List<UserTenantMembership> listMembershipsForUser(long userId) {
        List<UserTenantMembership> out = new ArrayList<>();
        for (TenantEntity tenant : listTenants()) {
            if (tenant == null || tenant.getId() == null) {
                continue;
            }
            findMembership(userId, tenant.getId()).ifPresent(out::add);
        }
        return out;
    }

    @Override
    public synchronized UserTenantMembership saveMembership(UserTenantMembership membership) {
        Objects.requireNonNull(membership.getUserId(), "userId required");
        String tenantId = TenantIds.normalizeOrDefault(membership.getTenantId());
        membership.setTenantId(tenantId);
        return membershipsFile(tenantId).upsert(
                membership,
                existing -> membership.getUserId().equals(existing.getUserId()));
    }

    @Override
    public synchronized void removeMembership(long userId, String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        membershipsFile(id).removeIf(existing -> existing.getUserId() != null && existing.getUserId() == userId);
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

    private JsonListFile<TenantRoleEntity> rolesFile(String tenantId) {
        return rolesByTenant.computeIfAbsent(tenantId, id -> new JsonListFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.tenantRoles(id),
                new TypeReference<>() {
                }));
    }

    private JsonListFile<UserTenantMembership> membershipsFile(String tenantId) {
        return membershipsByTenant.computeIfAbsent(tenantId, id -> new JsonListFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.tenantMemberships(id),
                new TypeReference<>() {
                }));
    }

    private static String nullToActive(String status) {
        return status == null || status.isBlank() ? "active" : status;
    }
}
