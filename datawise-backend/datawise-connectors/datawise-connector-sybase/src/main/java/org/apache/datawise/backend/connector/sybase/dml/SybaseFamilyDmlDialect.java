package org.apache.datawise.backend.connector.sybase.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

public final class SybaseFamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return DbType.SYBASE.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.SYBASE.matches(dbType);
    }

    @Override
    public int priority() {
        return 21;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.SYBASE.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(DbType.SYBASE.id(), database, tableName);
    }

    @Override
    protected String sqlLiteral(Object value) {
        if (value instanceof byte[] bytes) {
            return DmlSqlSupport.binaryLiteralSqlServer(bytes);
        }
        return DmlSqlSupport.sqlLiteral(value);
    }
}
