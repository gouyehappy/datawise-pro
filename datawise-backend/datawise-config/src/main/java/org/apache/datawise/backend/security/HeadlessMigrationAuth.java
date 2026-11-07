package org.apache.datawise.backend.security;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserAdminPolicy;

public final class HeadlessMigrationAuth {

    public static final String API_TOKEN_FORBIDDEN = "API_TOKEN_FORBIDDEN";

    private HeadlessMigrationAuth() {
    }

    public static void requireMigrationAccess() {
        if (UserContext.getUserId() == null) {
            throw new UnauthorizedException();
        }
        if (UserContext.isGuest()) {
            throw new IllegalArgumentException(UserAccessPolicy.GUEST_NOT_ALLOWED);
        }
        if (UserContext.isApiTokenAuth() && !UserContext.hasApiTokenScope(ApiTokenScopes.MIGRATION)) {
            throw new IllegalArgumentException(API_TOKEN_FORBIDDEN);
        }
    }

    /**
     * Config-layout migration touches tenant-root and cross-user files.
     * Session callers must be tenant admin; API tokens need the {@code migration} scope (CLI).
     */
    public static void requireConfigLayoutMigrationAccess(UserAdminPolicy adminPolicy) {
        if (UserContext.isApiTokenAuth()) {
            requireMigrationAccess();
            return;
        }
        if (adminPolicy == null) {
            throw new UnauthorizedException();
        }
        adminPolicy.requireAdminUser();
    }
}
