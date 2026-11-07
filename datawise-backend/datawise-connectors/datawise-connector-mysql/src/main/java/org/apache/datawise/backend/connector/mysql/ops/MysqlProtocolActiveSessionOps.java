package org.apache.datawise.backend.connector.mysql.ops;

import org.apache.datawise.backend.common.DbType;

/** MySQL 协议族活跃会话（含 Doris / StarRocks）。 */
public final class MysqlProtocolActiveSessionOps extends AbstractMysqlProtocolActiveSessionOps {

    @Override
    public String dialectId() {
        return "mysql-family";
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isMysqlProtocol(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }
}
