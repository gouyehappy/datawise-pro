package org.apache.datawise.backend.connector.mysql.ops;

import org.apache.datawise.backend.common.DbType;

/** MySQL 协议族会话终止（KILL / KILL QUERY）。 */
public final class MysqlProtocolSessionKillOps extends AbstractMysqlProtocolSessionKillOps {

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
