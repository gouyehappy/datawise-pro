package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.Optional;

/**
 * 管理员判定：优先当前租户 {@code tenant_admin} 角色；无 membership 时回退「id 最小非 guest」。
 */
@Service
public class UserAdminPolicy {

    public static final String ADMIN_REQUIRED = "ADMIN_REQUIRED";

    private final UserStore userStore;
    private final UserAccessPolicy accessPolicy;
    private final TenantStore tenantStore;
    private final TenancyProperties tenancyProperties;

    public UserAdminPolicy(
                           UserStore userStore,
                           UserAccessPolicy accessPolicy,
                           TenantStore tenantStore,
                           TenancyProperties tenancyProperties) {
        this.userStore = userStore;
        this.accessPolicy = accessPolicy;
        this.tenantStore = tenantStore;
        this.tenancyProperties = tenancyProperties;
    }

    public void requireAdminUser() {
        accessPolicy.requireRegisteredUser();
        if (UserContext.isApiTokenAuth()) {
            throw new UnauthorizedException();
        }
        if (!isAdminUser(accessPolicy.requireUserId())) {
            throw new IllegalArgumentException(ADMIN_REQUIRED);
        }
    }

    public boolean isAdminUser(long userId) {
        String tenantId = resolveTenantId();
        if (tenantStore.hasRoleKey(userId, tenantId, TenantIds.ROLE_TENANT_ADMIN)) {
            return true;
        }
        // 无 membership / 未 bootstrap 时兼容旧行为
        if (tenantStore.findMembership(userId, tenantId).isEmpty()) {
            return resolveBootstrapAdminUserId().map(adminId -> adminId == userId).orElse(false);
        }
        return false;
    }

    private String resolveTenantId() {
        String fromContext = UserContext.getTenantId();
        if (fromContext != null && !fromContext.isBlank()) {
            return fromContext;
        }
        return tenancyProperties.getDefaultTenantId();
    }

    private Optional<Long> resolveBootstrapAdminUserId() {
        return userStore.listRegisteredUsers().stream()
                .min(Comparator.comparing(UserEntity::getId))
                .map(UserEntity::getId);
    }
}
