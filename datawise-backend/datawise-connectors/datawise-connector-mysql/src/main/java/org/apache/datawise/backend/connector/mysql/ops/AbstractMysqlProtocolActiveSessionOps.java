package org.apache.datawise.backend.connector.mysql.ops;

import org.apache.datawise.backend.domain.ActiveSessionDto;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.ops.render.ActiveSessionResultParsing;
import org.apache.datawise.backend.ops.spi.ActiveSessionOps;

import java.util.List;

/** MySQL 协议族共享活跃会话 SQL（SHOW FULL PROCESSLIST）。 */
abstract class AbstractMysqlProtocolActiveSessionOps implements ActiveSessionOps {

    @Override
    public abstract String dialectId();

    @Override
    public abstract boolean supports(String dbType);

    @Override
    public abstract int priority();

    @Override
    public String buildQuery() {
        return "SHOW FULL PROCESSLIST";
    }

    @Override
    public String buildSelfSessionIdQuery() {
        return "SELECT CONNECTION_ID() AS session_id";
    }

    @Override
    public List<ActiveSessionDto> parseSessions(ExecuteSqlResult result, String excludeSessionId) {
        return ActiveSessionResultParsing.parse(result, excludeSessionId, true);
    }

    @Override
    public String readSelfSessionId(ExecuteSqlResult result) {
        return ActiveSessionResultParsing.readSelfSessionId(result);
    }
}
