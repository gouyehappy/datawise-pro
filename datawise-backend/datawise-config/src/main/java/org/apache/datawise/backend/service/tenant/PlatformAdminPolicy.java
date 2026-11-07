package org.apache.datawise.backend.service.tenant;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * 平台超管：{@code datawise.tenancy.platform-admin-user-ids} 白名单。
 * {@code single} 模式下与 default 租户 {@code tenant_admin} / bootstrap admin 等价。
 */
@Service
public class PlatformAdminPolicy {

    public static final String PLATFORM_ADMIN_REQUIRED = "PLATFORM_ADMIN_REQUIRED";

    private final TenancyProperties tenancyProperties;
    private final UserAccessPolicy accessPolicy;
    private final UserAdminPolicy userAdminPolicy;
    private final UserStore userStore;

    public PlatformAdminPolicy(
                               TenancyProperties tenancyProperties,
                               UserAccessPolicy accessPolicy,
                               UserAdminPolicy userAdminPolicy,
                               UserStore userStore) {
        this.tenancyProperties = tenancyProperties;
        this.accessPolicy = accessPolicy;
        this.userAdminPolicy = userAdminPolicy;
        this.userStore = userStore;
    }

    public void requirePlatformAdmin() {
        accessPolicy.requireRegisteredUser();
        if (UserContext.isApiTokenAuth()) {
            throw new UnauthorizedException();
        }
        if (!isPlatformAdmin(accessPolicy.requireUserId())) {
            throw new IllegalArgumentException(PLATFORM_ADMIN_REQUIRED);
        }
    }

    public boolean isPlatformAdmin(long userId) {
        List<Long> whitelist = tenancyProperties.getPlatformAdminUserIds();
        if (whitelist != null) {
            for (Long id : whitelist) {
                if (id != null && id == userId) {
                    return true;
                }
            }
        }
        if (tenancyProperties.isSingleMode()) {
            return userAdminPolicy.isAdminUser(userId);
        }
        // multi 且白名单为空：兼容首个注册用户为平台超管，便于私有化试跑
        if (whitelist == null || whitelist.isEmpty()) {
            return resolveBootstrapAdminUserId().map(adminId -> adminId == userId).orElse(false);
        }
        return false;
    }

    private Optional<Long> resolveBootstrapAdminUserId() {
        return userStore.listRegisteredUsers().stream()
                .min(Comparator.comparing(UserEntity::getId))
                .map(UserEntity::getId);
    }
}
