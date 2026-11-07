package org.apache.datawise.backend.connector.mysql.ops;

import org.apache.datawise.backend.common.DbType;

/** 单库 MySQL 协议 fork 的会话终止 ops。 */
public final class MysqlForkSessionKillOps extends AbstractMysqlProtocolSessionKillOps {

    private final DbType dbType;
    private final int priority;

    public MysqlForkSessionKillOps(DbType dbType, int priority) {
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
