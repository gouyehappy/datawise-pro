package org.apache.datawise.backend.connector.mysql;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.mysql.dml.MysqlForkDmlDialect;
import org.apache.datawise.backend.connector.mysql.ops.MysqlForkActiveSessionOps;
import org.apache.datawise.backend.connector.mysql.ops.MysqlForkLockWaitOps;
import org.apache.datawise.backend.connector.mysql.ops.MysqlForkSessionKillOps;
import org.apache.datawise.backend.connector.mysql.schema.MysqlForkSchemaDialect;
import org.apache.datawise.backend.connector.spi.ConnectorDialectContributions;
import org.apache.datawise.backend.ddl.spi.DialectDdlRenderer;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.schema.SchemaDialect;

/** MySQL 协议 fork 插件的统一方言注册（Provider 与 AutoConfiguration 共用）。 */
public final class MysqlForkRegistration {

    private MysqlForkRegistration() {
    }

    public static MysqlForkSchemaDialect schemaDialect(DbType dbType) {
        return new MysqlForkSchemaDialect(dbType);
    }

    public static MysqlForkDmlDialect dmlDialect(DbType dbType, int priority) {
        return new MysqlForkDmlDialect(dbType, priority);
    }

    public static MysqlForkActiveSessionOps activeSessionOps(DbType dbType, int priority) {
        return new MysqlForkActiveSessionOps(dbType, priority);
    }

    public static MysqlForkLockWaitOps lockWaitOps(DbType dbType, int priority) {
        return new MysqlForkLockWaitOps(dbType, priority);
    }

    public static MysqlForkSessionKillOps sessionKillOps(DbType dbType, int priority) {
        return new MysqlForkSessionKillOps(dbType, priority);
    }

    /** 仅 schema + DML（如 TiDB）。 */
    public static ConnectorDialectContributions dialectOnly(DbType dbType, int dmlPriority) {
        return ConnectorDialectContributions.builder()
                .addSchemaDialect(schemaDialect(dbType))
                .addDmlDialect(dmlDialect(dbType, dmlPriority))
                .build();
    }

    /** schema + DML + 运维 ops，可选 DDL 与表元数据 introspector（DML 与 ops 同优先级）。 */
    public static ConnectorDialectContributions withOps(
            DbType dbType,
            int priority,
            DialectDdlRenderer ddlRenderer,
            TableMetadataIntrospection tableIntrospector
    ) {
        return withOps(dbType, priority, priority, ddlRenderer, tableIntrospector);
    }

    /** schema + DML + 运维 ops，DML 与 ops 可设不同优先级（如 GBase8a）。 */
    public static ConnectorDialectContributions withOps(
            DbType dbType,
            int opsPriority,
            int dmlPriority,
            DialectDdlRenderer ddlRenderer,
            TableMetadataIntrospection tableIntrospector
    ) {
        MysqlForkActiveSessionOps sessionOps = activeSessionOps(dbType, opsPriority);
        return ConnectorDialectContributions.builder()
                .addDdlRenderer(ddlRenderer)
                .addSchemaDialect(schemaDialect(dbType))
                .addTableIntrospector(tableIntrospector)
                .addDmlDialect(dmlDialect(dbType, dmlPriority))
                .addActiveSessionOps(sessionOps)
                .addLockWaitOps(lockWaitOps(dbType, opsPriority))
                .addSessionKillOps(sessionKillOps(dbType, opsPriority))
                .build();
    }

    /** OLAP fork（Doris / StarRocks）：schema + DDL + introspector + DML。 */
    public static ConnectorDialectContributions olapContributions(
            DbType dbType,
            int dmlPriority,
            DialectDdlRenderer ddlRenderer,
            SchemaDialect schemaDialect,
            TableMetadataIntrospection tableIntrospector
    ) {
        return ConnectorDialectContributions.builder()
                .addDdlRenderer(ddlRenderer)
                .addSchemaDialect(schemaDialect)
                .addTableIntrospector(tableIntrospector)
                .addDmlDialect(dmlDialect(dbType, dmlPriority))
                .build();
    }
}
