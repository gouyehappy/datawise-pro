package org.apache.datawise.backend.dml.dialect;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;
import org.springframework.stereotype.Component;

/**
 * 通用 JDBC 回退方言。标识符引用由 {@link org.apache.datawise.backend.dml.DbTypeBoundDmlDialect} 按 dbType 绑定。
 */
@Component
public final class DefaultJdbcDmlDialect extends AbstractJdbcDmlDialect {

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
        return DbType.MYSQL.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return qualifiedDbTable(database, tableName);
    }
}
