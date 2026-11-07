package org.apache.datawise.backend.sync.preflight;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.service.UserAccountService;

import org.apache.datawise.backend.domain.TableMigrationPreflightRequest;
import org.apache.datawise.backend.domain.TableMigrationPreflightResult;
import org.apache.datawise.backend.domain.TableMigrationPreflightTableResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.sync.support.MigrationSupport;
import org.apache.datawise.backend.jdbc.support.MigrationWhereSupport;
import org.apache.datawise.backend.migration.TableMigrationPreflightSupport;
import org.apache.datawise.backend.migration.TableMigrationPreflightSupport.PreflightSummary;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/** 表迁移预检门面：编排多表检查后汇总状态。 */
@Service
public class TableMigrationPreflightService {

    private final ConnectionExecutionContext connectionContext;
    private final UserAccountService userAccountService;
    private final MigrationCompatibilityChecker compatibilityChecker;

    public TableMigrationPreflightService(
            ConnectionExecutionContext connectionContext,
            UserAccountService userAccountService,
            MigrationCompatibilityChecker compatibilityChecker
    ) {
        this.connectionContext = connectionContext;
        this.userAccountService = userAccountService;
        this.compatibilityChecker = compatibilityChecker;
    }

    public TableMigrationPreflightResult preflight(TableMigrationPreflightRequest request) {
        validateRequest(request);

        long userId = userAccountService.requireUserId();
        ConnectionEntity source = MigrationSupport.requireConnection(
                connectionContext,
                userId,
                request.sourceConnectionId()
        );
        ConnectionEntity target = MigrationSupport.requireConnection(
                connectionContext,
                userId,
                request.targetConnectionId()
        );

        String sourceDatabase = MigrationSupport.requireDatabase(source, request.sourceDatabase());
        String targetDatabase = MigrationSupport.requireDatabase(target, request.targetDatabase());
        MigrationSupport.requireDistinctScopes(
                request.sourceConnectionId(),
                sourceDatabase,
                request.targetConnectionId(),
                targetDatabase
        );

        List<TableMigrationPreflightTableResult> tables = new ArrayList<>();
        List<String> statuses = new ArrayList<>();
        for (String tableName : request.tableNames()) {
            if (tableName == null || tableName.isBlank()) {
                continue;
            }
            TableMigrationPreflightTableResult item = compatibilityChecker.checkTable(
                    source,
                    sourceDatabase,
                    target,
                    targetDatabase,
                    tableName.trim(),
                    request.whereClause()
            );
            tables.add(item);
            statuses.add(item.status());
        }

        PreflightSummary summary = TableMigrationPreflightSupport.summarizeStatuses(statuses);
        return new TableMigrationPreflightResult(
                summary.readyCount(),
                summary.warnCount(),
                summary.blockedCount(),
                summary.canProceed(),
                tables
        );
    }

    private static void validateRequest(TableMigrationPreflightRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Request is required");
        }
        if (request.sourceConnectionId() == null || request.sourceConnectionId().isBlank()) {
            throw new IllegalArgumentException("sourceConnectionId is required");
        }
        if (request.targetConnectionId() == null || request.targetConnectionId().isBlank()) {
            throw new IllegalArgumentException("targetConnectionId is required");
        }
        if (request.tableNames() == null || request.tableNames().isEmpty()) {
            throw new IllegalArgumentException("tableNames is required");
        }
        MigrationWhereSupport.validate(request.whereClause());
    }
}
