package org.apache.datawise.backend.connector.postgresql.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

import java.util.List;
import java.util.Map;

/** PostgreSQL 协议族 DML（postgresql / kingbase / greenplum / opengauss / highgo）。 */
public final class PostgresqlFamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return "postgresql";
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isPostgresqlFamily(dbType);
    }

    @Override
    public int priority() {
        return 21;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.POSTGRESQL.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(DbType.POSTGRESQL.id(), database, tableName);
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
