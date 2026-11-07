package org.apache.datawise.backend.sync.support;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.jdbc.support.MigrationWhereSupport;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;

/** 表迁移共享：连接解析、库名校验与 scope 检查。 */
public final class MigrationSupport {

    private MigrationSupport() {
    }

    public static ConnectionEntity requireConnection(
            ConnectionExecutionContext connectionContext,
            long userId,
            String connectionId
    ) {
        return connectionContext.requireAvailableConnection(
                userId,
                connectionId,
                "Connection not found: " + connectionId
        ).entity();
    }

    public static String requireDatabase(ConnectionEntity entity, String database) {
        return ConnectionExecutionContext.requireDatabase(entity, database);
    }

    public static void requireDistinctScopes(
            String sourceConnectionId,
            String sourceDatabase,
            String targetConnectionId,
            String targetDatabase
    ) {
        if (MigrationWhereSupport.scopesEqual(
                sourceConnectionId,
                sourceDatabase,
                targetConnectionId,
                targetDatabase
        )) {
            throw new IllegalArgumentException("Source and target must differ");
        }
    }
}
