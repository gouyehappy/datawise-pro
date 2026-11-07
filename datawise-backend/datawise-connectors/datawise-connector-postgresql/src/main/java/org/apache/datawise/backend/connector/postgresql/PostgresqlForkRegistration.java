package org.apache.datawise.backend.connector.postgresql;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.jdbc.PostgresqlConnectorOperations;
import org.apache.datawise.backend.connector.postgresql.ddl.PostgresqlDdlRenderer;
import org.apache.datawise.backend.connector.postgresql.dml.PostgresqlForkDmlDialect;
import org.apache.datawise.backend.connector.postgresql.ops.PostgresqlForkDatabaseOps;
import org.apache.datawise.backend.connector.postgresql.schema.PostgresqlSchemaDialect;
import org.apache.datawise.backend.connector.postgresql.support.PostgresqlTableIntrospector;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.ddl.spi.LogicalTypeParser;

/** PostgreSQL 协议 fork 插件的统一方言注册（Provider 与 AutoConfiguration 共用）。 */
public final class PostgresqlForkRegistration {

    private PostgresqlForkRegistration() {
    }

    public static PostgresqlConnectorOperations connectorOps(PostgresqlSchemaDialect schema, PostgresqlDdlRenderer ddl) {
        return new PostgresqlConnectorOperations(new PostgresqlTableIntrospector(schema, ddl), ddl);
    }

    public static PostgresqlForkDmlDialect dmlDialect(DbType dbType, int priority) {
        return new PostgresqlForkDmlDialect(dbType, priority);
    }

    public static PostgresqlForkDatabaseOps databaseOps(DbType dbType, int priority) {
        return new PostgresqlForkDatabaseOps(dbType, priority);
    }

    public static ConnectorDialectContributions contributions(
            DbType dbType,
            int priority,
            PostgresqlSchemaDialect schema,
            PostgresqlDdlRenderer ddl,
            LogicalTypeParser parser
    ) {
        PostgresqlForkDatabaseOps ops = databaseOps(dbType, priority);
        return ConnectorDialectContributions.builder()
                .addDdlRenderer(ddl)
                .addLogicalTypeParser(parser)
                .addSchemaDialect(schema)
                .addTableIntrospector(new PostgresqlTableIntrospector(schema, ddl))
                .addDmlDialect(dmlDialect(dbType, priority))
                .addActiveSessionOps(ops)
                .addLockWaitOps(ops)
                .addSessionKillOps(ops)
                .build();
    }
}
