package org.apache.datawise.backend.server.communityplugin;

import org.apache.datawise.backend.connector.api.support.SqlWriteClassifier;
import org.apache.datawise.backend.database.sql.SqlService;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.SqlReviewRequest;
import org.apache.datawise.backend.domain.SqlVisibleConnectionDto;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.apache.datawise.backend.platform.sql.SqlReviewOrchestrator;
import org.apache.datawise.backend.security.HeadlessSqlAuth;
import org.apache.datawise.backend.service.FeaturePermissionAccess;
import org.apache.datawise.backend.service.SqlVisibleConnectionsService;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * host.sql — plugins run read-only SQL on connections the current user can already see.
 * Credentials never leave the host. Declared via permission {@code host.sql}.
 */
@Service
public class CommunityPluginSqlBridge {

    public static final int MAX_ROWS = 500;
    public static final int MAX_SQL_CHARS = 100_000;

    private final CommunityPluginInstaller installer;
    private final SqlVisibleConnectionsService sqlVisibleConnectionsService;
    private final SqlService sqlService;
    private final SqlReviewOrchestrator sqlReviewOrchestrator;
    private final FeaturePermissionAccess featurePermissionAccess;

    public CommunityPluginSqlBridge(
            CommunityPluginInstaller installer,
            SqlVisibleConnectionsService sqlVisibleConnectionsService,
            SqlService sqlService,
            SqlReviewOrchestrator sqlReviewOrchestrator,
            FeaturePermissionAccess featurePermissionAccess
    ) {
        this.installer = installer;
        this.sqlVisibleConnectionsService = sqlVisibleConnectionsService;
        this.sqlService = sqlService;
        this.sqlReviewOrchestrator = sqlReviewOrchestrator;
        this.featurePermissionAccess = featurePermissionAccess;
    }

    public List<SqlVisibleConnectionDto> listConnections(String pluginId) {
        requireHostSql(pluginId);
        HeadlessSqlAuth.requireSqlAccess();
        featurePermissionAccess.requirePermission(UserFeaturePermission.NAV_DATABASE);
        return sqlVisibleConnectionsService.listForCurrentUser();
    }

    public ExecuteSqlResult executeReadonly(String pluginId, ExecuteSqlRequest request) {
        requireHostSql(pluginId);
        HeadlessSqlAuth.requireSqlAccess();
        if (request == null || request.sql() == null || request.sql().isBlank()) {
            throw new IllegalArgumentException("sql is required");
        }
        if (request.connectionId() == null || request.connectionId().isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        if (request.sql().length() > MAX_SQL_CHARS) {
            throw new IllegalArgumentException("sql exceeds host.sql size limit");
        }
        featurePermissionAccess.requireSqlExecute(request.sql());
        if (SqlWriteClassifier.requiresWriteAccess(request.sql())) {
            throw new IllegalArgumentException("host.sql allows read-only SQL only");
        }
        var review = sqlReviewOrchestrator.review(new SqlReviewRequest(
                request.sql(),
                request.connectionId(),
                request.database(),
                false
        ));
        if (!review.allowed()) {
            throw new IllegalArgumentException("SQL blocked by review");
        }
        int requested = request.maxRows() == null ? 200 : request.maxRows();
        int maxRows = Math.min(Math.max(requested, 1), MAX_ROWS);
        return sqlService.execute(new ExecuteSqlRequest(
                request.sql(),
                request.connectionId(),
                request.database(),
                maxRows,
                null,
                null,
                null,
                "community-plugin"
        ));
    }

    private void requireHostSql(String pluginId) {
        boolean allowed = installer.findInstalled(pluginId)
                .map(installed -> installed.manifest().permissions())
                .filter(list -> list != null && list.contains("host.sql"))
                .isPresent();
        if (!allowed) {
            throw new CommunityPluginException("permission host.sql is required");
        }
    }
}
