package org.apache.datawise.backend.connector.dm.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

/** Dameng DML rendering with double-quoted identifiers and schema-qualified tables. */
public final class DmFamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return "dm-family";
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isDmFamily(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.DM.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(DbType.DM.id(), database, tableName);
    }
}
