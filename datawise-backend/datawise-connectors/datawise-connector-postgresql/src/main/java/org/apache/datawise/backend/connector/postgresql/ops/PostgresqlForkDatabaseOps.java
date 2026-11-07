package org.apache.datawise.backend.connector.postgresql.ops;

import org.apache.datawise.backend.common.DbType;

/** 单库 PostgreSQL 协议 fork 的运维 SQL（gaussdb / opengauss / kingbase 等）。 */
public final class PostgresqlForkDatabaseOps extends AbstractPostgresqlDatabaseOps {

    private final DbType dbType;
    private final int priority;

    public PostgresqlForkDatabaseOps(DbType dbType, int priority) {
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
}
