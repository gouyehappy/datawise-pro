package org.apache.datawise.backend.connector.h2.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

public final class H2FamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return DbType.H2.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.H2.matches(dbType);
    }

    @Override
    public int priority() {
        return 21;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.H2.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(DbType.H2.id(), database, tableName);
    }
}
