package org.apache.datawise.backend.connector.kylin.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

/** Kylin DML rendering with double-quoted table identifiers. */
public final class KylinFamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return "kylin-family";
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.KYLIN.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.KYLIN.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.KYLIN.quoteName(DmlSqlSupport.sanitizeIdentifier(tableName));
    }
}
