package org.apache.datawise.backend.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

/** 为回退 DML 方言绑定 dbType，使标识符引用与表限定走 {@link DbType} 规则。 */
final class DbTypeBoundDmlDialect extends AbstractJdbcDmlDialect {

    private final String dbType;

    DbTypeBoundDmlDialect(String dbType) {
        this.dbType = dbType;
    }

    @Override
    public String dialectId() {
        return "jdbc-default";
    }

    @Override
    public boolean supports(String dbType) {
        return dbType != null && !dbType.isBlank();
    }

    @Override
    public int priority() {
        return 1000;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.quoteIdentifier(dbType, DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(dbType, database, tableName);
    }
}
