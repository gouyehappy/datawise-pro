package org.apache.datawise.backend.connector.tdengine.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

public final class TdengineFamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return DbType.TDENGINE.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.TDENGINE.matches(dbType);
    }

    @Override
    public int priority() {
        return 21;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DmlSqlSupport.sanitizeIdentifier(name);
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(DbType.TDENGINE.id(), database, tableName);
    }
}
