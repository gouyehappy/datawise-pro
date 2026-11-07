package org.apache.datawise.backend.connector.oracle.ops;

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
import java.util.regex.Pattern;

/** Oracle 运维 SQL（v$session / v$lock / ALTER SYSTEM KILL SESSION）。 */
public final class OracleFamilyDatabaseOps implements ActiveSessionOps, LockWaitOps, SessionKillOps {

    private static final Pattern ORACLE_SESSION_ID = Pattern.compile("^\\d+(,\\d+)?$");

    @Override
    public String dialectId() {
        return "oracle";
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.ORACLE.id().equalsIgnoreCase(DbType.normalizeId(dbType));
    }

    @Override
    public int priority() {
        return 21;
    }

    @Override
    public String buildQuery() {
        return """
                SELECT
                    CAST(s.sid AS VARCHAR2(32)) AS session_id,
                    s.username AS user_name,
                    COALESCE(s.machine, '') AS client_host,
                    COALESCE(s.schemaname, '') AS database_name,
                    COALESCE(s.status, '') AS session_state,
                    COALESCE(s.command, '') AS command,
                    GREATEST(0, ROUND((SYSDATE - NVL(s.sql_exec_start, s.logon_time)) * 86400)) AS duration_sec,
                    COALESCE(DBMS_LOB.SUBSTR(sq.sql_text, 4000, 1), '') AS current_sql
                FROM v$session s
                LEFT JOIN v$sql sq ON s.sql_id = sq.sql_id AND s.sql_child_number = sq.child_number
                WHERE s.type = 'USER'
                  AND s.username IS NOT NULL
                  AND s.sid <> SYS_CONTEXT('USERENV', 'SID')
                ORDER BY duration_sec DESC
                """;
    }

    @Override
    public String buildSelfSessionIdQuery() {
        return "SELECT CAST(SYS_CONTEXT('USERENV', 'SID') AS VARCHAR2(32)) AS session_id FROM DUAL";
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
                    CAST(w.sid AS VARCHAR2(32)) AS waiting_session_id,
                    ws.username AS waiting_user,
                    COALESCE(DBMS_LOB.SUBSTR(wq.sql_text, 4000, 1), '') AS waiting_sql,
                    CAST(b.sid AS VARCHAR2(32)) AS blocking_session_id,
                    bs.username AS blocking_user,
                    COALESCE(DBMS_LOB.SUBSTR(bq.sql_text, 4000, 1), '') AS blocking_sql,
                    GREATEST(0, ROUND(w.seconds_in_wait)) AS wait_seconds
                FROM v$session w
                JOIN v$session ws ON w.sid = ws.sid
                LEFT JOIN v$sql wq ON w.sql_id = wq.sql_id AND w.sql_child_number = wq.child_number
                JOIN v$session b ON w.blocking_session = b.sid
                JOIN v$session bs ON b.sid = bs.sid
                LEFT JOIN v$sql bq ON b.sql_id = bq.sql_id AND b.sql_child_number = bq.child_number
                WHERE w.blocking_session IS NOT NULL
                  AND w.sid <> SYS_CONTEXT('USERENV', 'SID')
                ORDER BY wait_seconds DESC
                """;
    }

    @Override
    public List<LockWaitEdgeDto> parseEdges(ExecuteSqlResult result) {
        return LockWaitResultParsing.parseEdges(result);
    }

    @Override
    public String buildKillSql(String sessionId, String mode) {
        if (sessionId == null || sessionId.isBlank()) {
            throw new IllegalArgumentException("sessionId is required");
        }
        String trimmed = sessionId.trim();
        if (!ORACLE_SESSION_ID.matcher(trimmed).matches()) {
            throw new IllegalArgumentException("Invalid sessionId: " + sessionId);
        }
        if (trimmed.contains(",")) {
            return "ALTER SYSTEM KILL SESSION '" + trimmed + "' IMMEDIATE";
        }
        return "ALTER SYSTEM KILL SESSION '" + trimmed + ",*' IMMEDIATE";
    }
}
