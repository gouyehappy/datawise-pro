package org.apache.datawise.backend.connector.mysql.ops;

import org.apache.datawise.backend.ops.spi.SessionKillOps;

/** MySQL 协议族共享会话终止 SQL（KILL / KILL QUERY）。 */
abstract class AbstractMysqlProtocolSessionKillOps implements SessionKillOps {

    @Override
    public abstract String dialectId();

    @Override
    public abstract boolean supports(String dbType);

    @Override
    public abstract int priority();

    @Override
    public String buildKillSql(String sessionId, String mode) {
        SessionKillOps.validateSessionId(sessionId);
        String normalizedMode = SessionKillOps.normalizeMode(mode);
        return SessionKillOps.MODE_CONNECTION.equals(normalizedMode)
                ? "KILL " + sessionId.trim()
                : "KILL QUERY " + sessionId.trim();
    }
}
