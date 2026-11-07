package org.apache.datawise.backend.connector.clickhouse.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

/** ClickHouse DML rendering with backtick identifiers and database-qualified tables. */
public final class ClickHouseFamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return "clickhouse-family";
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.CLICKHOUSE.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.CLICKHOUSE.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(DbType.CLICKHOUSE.id(), database, tableName);
    }
}
