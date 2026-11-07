package org.apache.datawise.backend.connector.oscar.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

/** Oscar DML rendering with double-quoted identifiers and schema-qualified tables. */
public final class OscarFamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return DbType.OSCAR.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.OSCAR.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.OSCAR.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(DbType.OSCAR.id(), database, tableName);
    }
}
