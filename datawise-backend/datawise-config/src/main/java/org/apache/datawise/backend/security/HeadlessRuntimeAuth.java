package org.apache.datawise.backend.security;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserAdminPolicy;

/**
 * Runtime connector / offline-zip management for interactive admins and headless CLI tokens.
 */
public final class HeadlessRuntimeAuth {

    private HeadlessRuntimeAuth() {
    }

    /**
     * Session callers must be tenant admin; API tokens need the {@code runtime} scope (CLI).
     */
    public static void requireRuntimeManageAccess(UserAdminPolicy adminPolicy) {
        if (UserContext.isApiTokenAuth()) {
            if (UserContext.getUserId() == null) {
                throw new UnauthorizedException();
            }
            if (UserContext.isGuest()) {
                throw new IllegalArgumentException(UserAccessPolicy.GUEST_NOT_ALLOWED);
            }
            if (!UserContext.hasApiTokenScope(ApiTokenScopes.RUNTIME)) {
                throw new IllegalArgumentException(HeadlessMigrationAuth.API_TOKEN_FORBIDDEN);
            }
            return;
        }
        if (adminPolicy == null) {
            throw new UnauthorizedException();
        }
        adminPolicy.requireAdminUser();
    }
}
