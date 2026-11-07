package org.apache.datawise.backend.ops.spi;

import org.apache.datawise.backend.domain.ActiveSessionDto;
import org.apache.datawise.backend.domain.ExecuteSqlResult;

import java.util.List;

/**
 * 活跃会话查询 SPI（SHOW PROCESSLIST / pg_stat_activity 等）。
 */
public interface ActiveSessionOps {

    String dialectId();

    boolean supports(String dbType);

    default int priority() {
        return 100;
    }

    String buildQuery();

    String buildSelfSessionIdQuery();

    List<ActiveSessionDto> parseSessions(ExecuteSqlResult result, String excludeSessionId);

    String readSelfSessionId(ExecuteSqlResult result);
}
