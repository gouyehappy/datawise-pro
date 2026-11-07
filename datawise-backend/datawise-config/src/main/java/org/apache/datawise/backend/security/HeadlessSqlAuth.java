package org.apache.datawise.backend.security;

import org.apache.datawise.backend.common.UnauthorizedException;

public final class HeadlessSqlAuth {

    private HeadlessSqlAuth() {
    }

    /** Scope gate for headless CLI; interactive session auth is unchanged. */
    public static void requireSqlAccess() {
        if (!UserContext.isApiTokenAuth()) {
            return;
        }
        if (UserContext.getUserId() == null) {
            throw new UnauthorizedException();
        }
        if (!UserContext.hasApiTokenScope(ApiTokenScopes.SQL)) {
            throw new IllegalArgumentException(HeadlessMigrationAuth.API_TOKEN_FORBIDDEN);
        }
    }
}
