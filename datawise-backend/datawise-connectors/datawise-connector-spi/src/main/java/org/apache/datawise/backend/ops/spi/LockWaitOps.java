package org.apache.datawise.backend.ops.spi;

import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.LockWaitEdgeDto;

import java.util.List;

/** 锁等待 / 阻塞链查询 SPI。 */
public interface LockWaitOps {

    String dialectId();

    boolean supports(String dbType);

    default int priority() {
        return 100;
    }

    /** @param mysqlLegacy 仅 MySQL 族有效：回退到 information_schema.innodb_lock_waits */
    String buildQuery(boolean mysqlLegacy);

    List<LockWaitEdgeDto> parseEdges(ExecuteSqlResult result);
}
