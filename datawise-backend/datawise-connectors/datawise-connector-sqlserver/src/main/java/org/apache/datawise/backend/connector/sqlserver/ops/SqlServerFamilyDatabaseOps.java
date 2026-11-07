package org.apache.datawise.backend.connector.sqlserver.ops;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.ActiveSessionDto;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.LockWaitEdgeDto;
import org.apache.datawise.backend.ops.render.ActiveSessionResultParsing;
import org.apache.datawise.backend.ops.render.LockWaitResultParsing;
import org.apache.datawise.backend.ops.spi.ActiveSessionOps;
import org.apache.datawise.backend.ops.spi.LockWaitOps;
import org.apache.datawise.backend.ops.spi.SessionKillOps;

import java.util.List;

/** SQL Server 运维 SQL（活跃会话 / 锁等待 / KILL）。 */
public final class SqlServerFamilyDatabaseOps implements ActiveSessionOps, LockWaitOps, SessionKillOps {

    @Override
    public String dialectId() {
        return "sqlserver";
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isSqlServerFamily(dbType);
    }

    @Override
    public int priority() {
        return 22;
    }

    @Override
    public String buildQuery() {
        return """
                SELECT
                    r.session_id AS session_id,
                    s.login_name AS user_name,
                    COALESCE(s.host_name, '') AS client_host,
                    DB_NAME(r.database_id) AS database_name,
                    COALESCE(r.status, '') AS session_state,
                    COALESCE(r.command, '') AS command,
                    r.total_elapsed_time / 1000 AS duration_sec,
                    COALESCE(LEFT(t.text, 4000), '') AS current_sql
                FROM sys.dm_exec_requests r
                INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
                CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
                WHERE r.session_id <> @@SPID
                ORDER BY r.total_elapsed_time DESC
                """;
    }

    @Override
    public String buildSelfSessionIdQuery() {
        return "SELECT CAST(@@SPID AS varchar(32)) AS session_id";
    }

    @Override
    public List<ActiveSessionDto> parseSessions(ExecuteSqlResult result, String excludeSessionId) {
        return ActiveSessionResultParsing.parse(result, excludeSessionId, false);
    }

    @Override
    public String readSelfSessionId(ExecuteSqlResult result) {
        return ActiveSessionResultParsing.readSelfSessionId(result);
    }

    @Override
    public String buildQuery(boolean mysqlLegacy) {
        return """
                SELECT
                    CAST(r.session_id AS varchar(32)) AS waiting_session_id,
                    s.login_name AS waiting_user,
                    COALESCE(LEFT(t.text, 4000), '') AS waiting_sql,
                    CAST(r.blocking_session_id AS varchar(32)) AS blocking_session_id,
                    bs.login_name AS blocking_user,
                    COALESCE(LEFT(bt.text, 4000), '') AS blocking_sql,
                    r.wait_time / 1000 AS wait_seconds
                FROM sys.dm_exec_requests r
                INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
                LEFT JOIN sys.dm_exec_sessions bs ON r.blocking_session_id = bs.session_id
                OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
                OUTER APPLY sys.dm_exec_sql_text(
                    (SELECT TOP 1 sql_handle FROM sys.dm_exec_requests br WHERE br.session_id = r.blocking_session_id)
                ) bt
                WHERE r.blocking_session_id <> 0
                  AND r.session_id <> @@SPID
                ORDER BY r.wait_time DESC
                """;
    }

    @Override
    public List<LockWaitEdgeDto> parseEdges(ExecuteSqlResult result) {
        return LockWaitResultParsing.parseEdges(result);
    }

    @Override
    public String buildKillSql(String sessionId, String mode) {
        SessionKillOps.validateSessionId(sessionId);
        return "KILL " + sessionId.trim();
    }
}
