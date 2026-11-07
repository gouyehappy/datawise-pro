package org.apache.datawise.backend.connector.mysql.ops;

import org.apache.datawise.backend.common.DbType;

/** MySQL 族锁等待（InnoDB / performance_schema.data_lock_waits）。 */
public final class MysqlFamilyLockWaitOps extends AbstractMysqlProtocolLockWaitOps {

    @Override
    public String dialectId() {
        return "mysql-family";
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isMysqlFamily(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }
}
