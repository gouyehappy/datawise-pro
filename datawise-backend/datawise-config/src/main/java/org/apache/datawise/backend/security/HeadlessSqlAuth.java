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
        // sql:write implies sql; both may enter the SQL entrypoint, DDL/DML is still
        // gated per-feature by FeaturePermissionAccess.requireSqlExecute().
        if (!UserContext.hasApiTokenScope(ApiTokenScopes.SQL)
                && !UserContext.hasApiTokenScope(ApiTokenScopes.SQL_WRITE)) {
            throw new IllegalArgumentException(HeadlessMigrationAuth.API_TOKEN_FORBIDDEN);
        }
    }
}
