package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.domain.SaveTenantRoleRequest;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.domain.TenantRoleDto;
import org.apache.datawise.backend.domain.UpdateUserPermissionsRequest;
import org.apache.datawise.backend.domain.UpdateUserRolesRequest;
import org.apache.datawise.backend.domain.UserPermissionSummaryDto;
import org.apache.datawise.backend.model.TenantRoleEntity;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.model.UserTenantMembership;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class UserAdminService {

    public static final String CANNOT_MODIFY_ADMIN = "CANNOT_MODIFY_ADMIN_PERMISSIONS";
    public static final String INVALID_ROLE = "INVALID_ROLE";
    public static final String ROLES_REQUIRED = "ROLES_REQUIRED";
    public static final String ROLE_KEY_INVALID = "ROLE_KEY_INVALID";
    public static final String ROLE_KEY_EXISTS = "ROLE_KEY_EXISTS";
    public static final String ROLE_SYSTEM_LOCKED = "ROLE_SYSTEM_LOCKED";
    public static final String ROLE_IN_USE = "ROLE_IN_USE";
    public static final String ROLE_NAME_REQUIRED = "ROLE_NAME_REQUIRED";

    private static final Pattern ROLE_KEY_PATTERN = Pattern.compile("^[a-z][a-z0-9_]{1,31}$");

    private final UserStore userStore;
    private final UserAdminPolicy adminPolicy;
    private final UserPermissionPolicy permissionPolicy;
    private final TenantStore tenantStore;
    private final TenancyProperties tenancyProperties;

    public UserAdminService(
                            UserStore userStore,
                            UserAdminPolicy adminPolicy,
                            UserPermissionPolicy permissionPolicy,
                            TenantStore tenantStore,
                            TenancyProperties tenancyProperties) {
        this.userStore = userStore;
        this.adminPolicy = adminPolicy;
        this.permissionPolicy = permissionPolicy;
        this.tenantStore = tenantStore;
        this.tenancyProperties = tenancyProperties;
    }

    public List<UserPermissionSummaryDto> listUsers() {
        adminPolicy.requireAdminUser();
        return userStore.listAllUsers().stream()
                .sorted(Comparator.comparing(UserEntity::getId))
                .map(this::toSummary)
                .toList();
    }

    public List<TenantRoleDto> listRoles() {
        adminPolicy.requireAdminUser();
        return tenantStore.listRoles(currentTenantId()).stream()
                .sorted(Comparator.comparing(TenantRoleEntity::getKey, Comparator.nullsLast(String::compareTo)))
                .map(this::toRoleDto)
                .toList();
    }

    public TenantRoleDto createRole(SaveTenantRoleRequest request) {
        adminPolicy.requireAdminUser();
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException(ROLE_NAME_REQUIRED);
        }
        String key = normalizeRoleKey(request.key());
        String tenantId = currentTenantId();
        if (tenantStore.findRoleByKey(tenantId, key).isPresent()) {
            throw new IllegalArgumentException(ROLE_KEY_EXISTS);
        }
        TenantRoleEntity role = new TenantRoleEntity();
        role.setId(IdGenerator.shortId("role-"));
        role.setTenantId(tenantId);
        role.setKey(key);
        role.setName(request.name().trim());
        role.setSystem(false);
        role.setPermissions(permissionPolicy.sanitizeUpdate(request.permissions()));
        return toRoleDto(tenantStore.saveRole(role));
    }

    public TenantRoleDto updateRole(String roleId, SaveTenantRoleRequest request) {
        adminPolicy.requireAdminUser();
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException(ROLE_NAME_REQUIRED);
        }
        String tenantId = currentTenantId();
        TenantRoleEntity role = tenantStore.findRoleById(tenantId, roleId)
                .orElseThrow(() -> new IllegalArgumentException(INVALID_ROLE));
        if (TenantIds.ROLE_TENANT_ADMIN.equals(role.getKey())) {
            throw new IllegalArgumentException(ROLE_SYSTEM_LOCKED);
        }
        role.setName(request.name().trim());
        role.setPermissions(permissionPolicy.sanitizeUpdate(request.permissions()));
        return toRoleDto(tenantStore.saveRole(role));
    }

    public void deleteRole(String roleId) {
        adminPolicy.requireAdminUser();
        String tenantId = currentTenantId();
        TenantRoleEntity role = tenantStore.findRoleById(tenantId, roleId)
                .orElseThrow(() -> new IllegalArgumentException(INVALID_ROLE));
        if (role.isSystem() || TenantIds.ROLE_TENANT_ADMIN.equals(role.getKey())) {
            throw new IllegalArgumentException(ROLE_SYSTEM_LOCKED);
        }
        for (UserTenantMembership membership : tenantStore.listMemberships(tenantId)) {
            if (membership.getRoleIds() != null && membership.getRoleIds().contains(role.getId())) {
                throw new IllegalArgumentException(ROLE_IN_USE);
            }
        }
        tenantStore.deleteRole(tenantId, role.getId());
    }

    public UserPermissionSummaryDto updateUserPermissions(long userId, UpdateUserPermissionsRequest request) {
        adminPolicy.requireAdminUser();
        if (adminPolicy.isAdminUser(userId)) {
            throw new IllegalArgumentException(CANNOT_MODIFY_ADMIN);
        }
        UserEntity user = userStore.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("USER_NOT_FOUND"));
        Map<String, Boolean> next = permissionPolicy.sanitizeUpdate(
                request != null ? request.featurePermissions() : null);
        user.setFeaturePermissions(next);
        user.setUpdatedAt(Instant.now());
        userStore.saveUser(user);
        // 自定义权限与角色互斥：写入 map 时卸下角色绑定
        if (!user.isGuest()) {
            clearMembershipRoles(userId);
        }
        return toSummary(user);
    }

    /**
     * 分配租户角色；清空自定义 feature map，使角色成为唯一来源。
     * 可将成员设为 tenant_admin（与租户成员邀请一致）；不能改当前已是管理员的账号。
     */
    public UserPermissionSummaryDto updateUserRoles(long userId, UpdateUserRolesRequest request) {
        adminPolicy.requireAdminUser();
        if (adminPolicy.isAdminUser(userId)) {
            throw new IllegalArgumentException(CANNOT_MODIFY_ADMIN);
        }
        UserEntity user = userStore.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("USER_NOT_FOUND"));
        if (user.isGuest()) {
            throw new IllegalArgumentException("GUEST_ROLES_UNSUPPORTED");
        }
        List<String> roleIds = normalizeRoleIds(request != null ? request.roleIds() : null);
        if (roleIds.isEmpty()) {
            throw new IllegalArgumentException(ROLES_REQUIRED);
        }
        String tenantId = currentTenantId();
        for (String roleId : roleIds) {
            if (tenantStore.findRoleById(tenantId, roleId).isEmpty()) {
                throw new IllegalArgumentException(INVALID_ROLE);
            }
        }

        UserTenantMembership membership = tenantStore.findMembership(userId, tenantId)
                .orElseGet(UserTenantMembership::new);
        membership.setUserId(userId);
        membership.setTenantId(tenantId);
        membership.setStatus("active");
        if (membership.getJoinedAt() == null) {
            membership.setJoinedAt(Instant.now());
        }
        membership.setRoleIds(roleIds);
        tenantStore.saveMembership(membership);

        user.setFeaturePermissions(null);
        user.setUpdatedAt(Instant.now());
        userStore.saveUser(user);
        return toSummary(user);
    }

    private void clearMembershipRoles(long userId) {
        String tenantId = currentTenantId();
        tenantStore.findMembership(userId, tenantId).ifPresent(membership -> {
            membership.setRoleIds(List.of());
            tenantStore.saveMembership(membership);
        });
    }

    private UserPermissionSummaryDto toSummary(UserEntity user) {
        String tenantId = currentTenantId();
        List<String> roleIds = List.of();
        List<String> roleKeys = List.of();
        var membership = tenantStore.findMembership(user.getId(), tenantId);
        if (membership.isPresent() && membership.get().getRoleIds() != null) {
            roleIds = List.copyOf(membership.get().getRoleIds());
            List<String> keys = new ArrayList<>();
            for (String roleId : roleIds) {
                tenantStore.findRoleById(tenantId, roleId)
                        .map(TenantRoleEntity::getKey)
                        .ifPresent(keys::add);
            }
            roleKeys = List.copyOf(keys);
        }
        Map<String, Boolean> stored = user.getFeaturePermissions();
        boolean hasCustomMap = stored != null && !stored.isEmpty();
        boolean roleBound = !roleIds.isEmpty();
        // 角色绑定优先；仅「无角色 + 有 map」才算自定义覆盖
        boolean usesLegacy = hasCustomMap && !roleBound;
        // 修复历史脏数据：有角色仍残留 map 时清掉，避免误导
        if (roleBound && hasCustomMap && !user.isGuest()) {
            user.setFeaturePermissions(null);
            user.setUpdatedAt(Instant.now());
            userStore.saveUser(user);
            hasCustomMap = false;
            usesLegacy = false;
        }
        return new UserPermissionSummaryDto(
                user.getId(),
                user.getUsername(),
                user.getDisplayName() != null && !user.getDisplayName().isBlank()
                        ? user.getDisplayName()
                        : user.getUsername(),
                user.isGuest(),
                adminPolicy.isAdminUser(user.getId()),
                permissionPolicy.resolveEffectivePermissions(user),
                roleIds,
                roleKeys,
                usesLegacy);
    }

    private TenantRoleDto toRoleDto(TenantRoleEntity role) {
        return new TenantRoleDto(
                role.getId(),
                role.getKey(),
                role.getName(),
                role.isSystem(),
                role.getPermissions());
    }

    private List<String> normalizeRoleIds(List<String> roleIds) {
        if (roleIds == null || roleIds.isEmpty()) {
            return List.of();
        }
        Set<String> unique = new LinkedHashSet<>();
        for (String roleId : roleIds) {
            if (roleId != null && !roleId.isBlank()) {
                unique.add(roleId.trim());
            }
        }
        return List.copyOf(unique);
    }

    private String normalizeRoleKey(String key) {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException(ROLE_KEY_INVALID);
        }
        String normalized = key.trim().toLowerCase(Locale.ROOT);
        if (!ROLE_KEY_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException(ROLE_KEY_INVALID);
        }
        if (TenantIds.ROLE_TENANT_ADMIN.equals(normalized)) {
            throw new IllegalArgumentException(ROLE_SYSTEM_LOCKED);
        }
        return normalized;
    }

    private String currentTenantId() {
        String fromContext = UserContext.getTenantId();
        if (fromContext != null && !fromContext.isBlank()) {
            return fromContext;
        }
        return Objects.requireNonNullElse(tenancyProperties.getDefaultTenantId(), TenantIds.DEFAULT);
    }
}
