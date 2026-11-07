package org.apache.datawise.backend.connector.mysql.schema;

import org.apache.datawise.backend.common.DbType;

/** 单库 MySQL 协议 fork 的 Schema 方言（catalog = database）。 */
public final class MysqlForkSchemaDialect extends MysqlSchemaDialect {

    private final DbType dbType;

    public MysqlForkSchemaDialect(DbType dbType) {
        this.dbType = dbType;
    }

    @Override
    public String id() {
        return dbType.id();
    }

    @Override
    public boolean supports(String dbType) {
        return this.dbType.id().equals(DbType.normalizeId(dbType));
    }
}
