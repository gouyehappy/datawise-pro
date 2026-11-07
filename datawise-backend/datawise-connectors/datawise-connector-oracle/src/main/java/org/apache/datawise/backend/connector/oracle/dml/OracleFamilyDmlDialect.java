package org.apache.datawise.backend.connector.oracle.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

/** Oracle DML rendering with double-quoted identifiers and schema-qualified tables. */
public final class OracleFamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return "oracle-family";
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.ORACLE.id().equalsIgnoreCase(DbType.normalizeId(dbType));
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.ORACLE.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(DbType.ORACLE.id(), database, tableName);
    }
}
