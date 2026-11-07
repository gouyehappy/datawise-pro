package org.apache.datawise.backend.service;

import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.domain.TenantRolePresets;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * 用户功能权限裁决（角色优先）：
 * guest → 非空自定义 map / workbench；
 * tenant_admin → full；
 * membership 角色并集 → 忽略用户 map；
 * 无角色但有自定义 map → 自定义；
 * 否则 → readonly。
 */
@Service
public class UserPermissionPolicy {

    public static final String PERMISSION_DENIED = "PERMISSION_DENIED";

    private final UserAdminPolicy adminPolicy;
    private final TenantStore tenantStore;
    private final TenancyProperties tenancyProperties;

    public UserPermissionPolicy(
                                UserAdminPolicy adminPolicy,
                                TenantStore tenantStore,
                                TenancyProperties tenancyProperties) {
        this.adminPolicy = adminPolicy;
        this.tenantStore = tenantStore;
        this.tenancyProperties = tenancyProperties;
    }

    public Map<String, Boolean> resolveEffectivePermissions(UserEntity user) {
        if (user == null || user.getId() == null) {
            return TenantRolePresets.readonly();
        }
        if (user.isGuest()) {
            Map<String, Boolean> stored = user.getFeaturePermissions();
            if (stored != null && !stored.isEmpty()) {
                return normalizeStoredPermissions(stored);
            }
            return UserFeaturePermission.workbenchPreset();
        }
        if (adminPolicy.isAdminUser(user.getId())) {
            return UserFeaturePermission.fullPreset();
        }
        Optional<Map<String, Boolean>> fromRoles = tenantStore.resolveRolePermissions(
                user.getId(),
                resolveTenantId());
        if (fromRoles.isPresent()) {
            return normalizeStoredPermissions(fromRoles.get());
        }
        Map<String, Boolean> stored = user.getFeaturePermissions();
        if (stored != null && !stored.isEmpty()) {
            return normalizeStoredPermissions(stored);
        }
        return TenantRolePresets.readonly();
    }

    public boolean hasPermission(UserEntity user, String feature) {
        if (feature == null || feature.isBlank()) {
            return false;
        }
        return resolveEffectivePermissions(user).getOrDefault(feature.trim(), false);
    }

    public void requirePermission(UserEntity user, String feature) {
        if (!hasPermission(user, feature)) {
            throw new IllegalArgumentException(PERMISSION_DENIED);
        }
    }

    public Map<String, Boolean> sanitizeUpdate(Map<String, Boolean> requested) {
        Map<String, Boolean> normalized = TenantRolePresets.readonly();
        if (requested == null) {
            return normalized;
        }
        for (String key : UserFeaturePermission.ALL) {
            Boolean granted = requested.get(key);
            if (granted != null) {
                normalized.put(key, granted);
            }
        }
        return normalized;
    }

    private Map<String, Boolean> normalizeStoredPermissions(Map<String, Boolean> stored) {
        Map<String, Boolean> normalized = new LinkedHashMap<>(TenantRolePresets.readonly());
        for (Map.Entry<String, Boolean> entry : stored.entrySet()) {
            if (entry.getKey() == null || !UserFeaturePermission.ALL.contains(entry.getKey())) {
                continue;
            }
            normalized.put(entry.getKey(), Boolean.TRUE.equals(entry.getValue()));
        }
        // 旧权限表缺 settings.projects：有基础设置权限则默认放开
        if (!stored.containsKey(UserFeaturePermission.SETTINGS_PROJECTS)
                && Boolean.TRUE.equals(normalized.get(UserFeaturePermission.SETTINGS_BASIC))) {
            normalized.put(UserFeaturePermission.SETTINGS_PROJECTS, true);
        }
        return normalized;
    }

    private String resolveTenantId() {
        String fromContext = UserContext.getTenantId();
        if (fromContext != null && !fromContext.isBlank()) {
            return fromContext;
        }
        return TenantIds.normalizeOrDefault(tenancyProperties.getDefaultTenantId());
    }
}
