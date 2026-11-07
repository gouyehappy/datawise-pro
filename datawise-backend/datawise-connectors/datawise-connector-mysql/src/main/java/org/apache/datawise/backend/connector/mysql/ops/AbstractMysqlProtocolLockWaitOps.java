package org.apache.datawise.backend.connector.mysql.ops;

import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.LockWaitEdgeDto;
import org.apache.datawise.backend.ops.render.LockWaitResultParsing;
import org.apache.datawise.backend.ops.spi.LockWaitOps;

import java.util.List;

/** MySQL 协议族共享锁等待 SQL（InnoDB / performance_schema）。 */
abstract class AbstractMysqlProtocolLockWaitOps implements LockWaitOps {

    @Override
    public abstract String dialectId();

    @Override
    public abstract boolean supports(String dbType);

    @Override
    public abstract int priority();

    @Override
    public String buildQuery(boolean mysqlLegacy) {
        if (mysqlLegacy) {
            return """
                    SELECT
                        r.trx_mysql_thread_id AS waiting_session_id,
                        COALESCE(r.trx_query, '') AS waiting_sql,
                        b.trx_mysql_thread_id AS blocking_session_id,
                        COALESCE(b.trx_query, '') AS blocking_sql,
                        GREATEST(0, TIMESTAMPDIFF(SECOND, r.trx_wait_started, NOW())) AS wait_seconds
                    FROM information_schema.innodb_lock_waits w
                    INNER JOIN information_schema.innodb_trx b ON b.trx_id = w.blocking_trx_id
                    INNER JOIN information_schema.innodb_trx r ON r.trx_id = w.requesting_trx_id
                    """;
        }
        return """
                SELECT
                    r.trx_mysql_thread_id AS waiting_session_id,
                    COALESCE(r.trx_query, '') AS waiting_sql,
                    b.trx_mysql_thread_id AS blocking_session_id,
                    COALESCE(b.trx_query, '') AS blocking_sql,
                    GREATEST(0, TIMESTAMPDIFF(SECOND, r.trx_wait_started, NOW())) AS wait_seconds
                FROM performance_schema.data_lock_waits w
                INNER JOIN information_schema.innodb_trx b
                    ON b.trx_id = w.blocking_engine_transaction_id
                INNER JOIN information_schema.innodb_trx r
                    ON r.trx_id = w.requesting_engine_transaction_id
                """;
    }

    @Override
    public List<LockWaitEdgeDto> parseEdges(ExecuteSqlResult result) {
        return LockWaitResultParsing.parseEdges(result);
    }
}
