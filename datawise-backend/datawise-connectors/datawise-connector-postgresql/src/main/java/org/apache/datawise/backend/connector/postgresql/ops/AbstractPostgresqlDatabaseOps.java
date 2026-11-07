package org.apache.datawise.backend.connector.postgresql.ops;

import org.apache.datawise.backend.domain.ActiveSessionDto;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.LockWaitEdgeDto;
import org.apache.datawise.backend.ops.render.ActiveSessionResultParsing;
import org.apache.datawise.backend.ops.render.LockWaitResultParsing;
import org.apache.datawise.backend.ops.spi.ActiveSessionOps;
import org.apache.datawise.backend.ops.spi.LockWaitOps;
import org.apache.datawise.backend.ops.spi.SessionKillOps;

import java.util.List;

/** PostgreSQL 协议族共享运维 SQL（pg_stat_activity / pg_blocking_pids）。 */
abstract class AbstractPostgresqlDatabaseOps implements ActiveSessionOps, LockWaitOps, SessionKillOps {

    @Override
    public abstract String dialectId();

    @Override
    public abstract boolean supports(String dbType);

    @Override
    public abstract int priority();

    @Override
    public String buildQuery() {
        return """
                SELECT
                    pid AS session_id,
                    usename AS user_name,
                    COALESCE(host(client_addr), '') AS client_host,
                    datname AS database_name,
                    COALESCE(state, '') AS session_state,
                    COALESCE(backend_type, '') AS command,
                    GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(query_start, backend_start)))::bigint) AS duration_sec,
                    COALESCE(left(query, 4000), '') AS current_sql
                FROM pg_stat_activity
                WHERE pid <> pg_backend_pid()
                  AND datname IS NOT NULL
                ORDER BY query_start NULLS LAST
                """;
    }

    @Override
    public String buildSelfSessionIdQuery() {
        return "SELECT pg_backend_pid()::text AS session_id";
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
                    blocked.pid::text AS waiting_session_id,
                    blocked.usename AS waiting_user,
                    COALESCE(left(blocked.query, 4000), '') AS waiting_sql,
                    blocking.pid::text AS blocking_session_id,
                    blocking.usename AS blocking_user,
                    COALESCE(left(blocking.query, 4000), '') AS blocking_sql,
                    GREATEST(0, EXTRACT(EPOCH FROM (now() - blocked.query_start))::bigint) AS wait_seconds
                FROM pg_stat_activity blocked
                JOIN pg_stat_activity blocking
                    ON blocking.pid = ANY (pg_catalog.pg_blocking_pids(blocked.pid))
                WHERE blocked.pid <> pg_backend_pid()
                  AND blocked.datname IS NOT NULL
                ORDER BY wait_seconds DESC
                """;
    }

    @Override
    public List<LockWaitEdgeDto> parseEdges(ExecuteSqlResult result) {
        return LockWaitResultParsing.parseEdges(result);
    }

    @Override
    public String buildKillSql(String sessionId, String mode) {
        SessionKillOps.validateSessionId(sessionId);
        String function = SessionKillOps.MODE_CONNECTION.equals(SessionKillOps.normalizeMode(mode))
                ? "pg_terminate_backend"
                : "pg_cancel_backend";
        return "SELECT " + function + "(" + sessionId.trim() + ")";
    }
}
