package org.apache.datawise.backend.connector.postgresql.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

import java.util.List;
import java.util.Map;

/** 单库 PostgreSQL 协议 fork 的 DML 渲染（双引号标识符 + schema.table 限定）。 */
public final class PostgresqlForkDmlDialect extends AbstractJdbcDmlDialect {

    private final DbType dbType;
    private final int priority;

    public PostgresqlForkDmlDialect(DbType dbType, int priority) {
        this.dbType = dbType;
        this.priority = priority;
    }

    @Override
    public String dialectId() {
        return dbType.id();
    }

    @Override
    public boolean supports(String dbType) {
        return this.dbType.id().equals(DbType.normalizeId(dbType));
    }

    @Override
    public int priority() {
        return priority;
    }

    @Override
    public String quoteIdentifier(String name) {
        return dbType.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(dbType.id(), database, tableName);
    }

    @Override
    public String buildMultiUpsert(
            String database,
            String tableName,
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows,
            List<String> keyColumns,
            String conflictStrategy
    ) {
        return PostgresqlUpsertSupport.build(
                this, database, tableName, columns, rows, keyColumns, conflictStrategy
        );
    }

    @Override
    public String buildUpsertPrepared(
            String database,
            String tableName,
            MultiRowColumns meta,
            List<String> keyColumns,
            String conflictStrategy
    ) {
        return PostgresqlUpsertSupport.buildPrepared(
                this, database, tableName, meta, keyColumns, conflictStrategy
        );
    }

    @Override
    protected String sqlLiteral(Object value) {
        if (value instanceof byte[] bytes) {
            return DmlSqlSupport.binaryLiteralPostgres(bytes);
        }
        return DmlSqlSupport.sqlLiteral(value);
    }
}
