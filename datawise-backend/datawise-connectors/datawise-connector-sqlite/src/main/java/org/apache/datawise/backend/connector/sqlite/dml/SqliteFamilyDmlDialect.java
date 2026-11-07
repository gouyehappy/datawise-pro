package org.apache.datawise.backend.connector.sqlite.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

/** SQLite DML rendering with double-quoted identifiers. */
public final class SqliteFamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return DbType.SQLITE3.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.SQLITE3.matches(dbType);
    }

    @Override
    public int priority() {
        return 14;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.SQLITE3.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(DbType.SQLITE3.id(), database, tableName);
    }
}
