package org.apache.datawise.backend.connector.mysql.ops;

import org.apache.datawise.backend.common.DbType;

/** 单库 MySQL 协议 fork 的活跃会话 ops。 */
public final class MysqlForkActiveSessionOps extends AbstractMysqlProtocolActiveSessionOps {

    private final DbType dbType;
    private final int priority;

    public MysqlForkActiveSessionOps(DbType dbType, int priority) {
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
