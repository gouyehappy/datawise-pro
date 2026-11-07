package org.apache.datawise.backend.connector.mysql.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

/** 单库 MySQL 协议 fork 的 DML 渲染（反引号标识符 + database.table 限定）。 */
public final class MysqlForkDmlDialect extends AbstractJdbcDmlDialect {

    private final DbType dbType;
    private final int priority;

    public MysqlForkDmlDialect(DbType dbType, int priority) {
        this.dbType = dbType;
        this.priority = priority;
    }

    @Override
    public String dialectId() {
        return dbType.id();
    }

    @Override
    public boolean supports(String dbType) {
        return this.dbType.id().equals(DbType.normalizeId(dbType));
    }

    @Override
    public int priority() {
        return priority;
    }

    @Override
    public String quoteIdentifier(String name) {
        return dbType.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(dbType.id(), database, tableName);
    }
}
