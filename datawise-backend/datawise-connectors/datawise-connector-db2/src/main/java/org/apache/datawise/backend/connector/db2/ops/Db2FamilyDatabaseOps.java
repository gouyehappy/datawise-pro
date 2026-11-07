package org.apache.datawise.backend.connector.db2.ops;

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

/** DB2 运维 SQL（V$SESSIONS / V$TRXWAIT / SP_CLOSE_SESSION）。 */
public final class Db2FamilyDatabaseOps implements ActiveSessionOps, LockWaitOps, SessionKillOps {

    private static final Pattern DM_SESSION_ID = Pattern.compile("^\\d+$");

    @Override
    public String dialectId() {
        return "db2";
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isDb2Family(dbType);
    }

    @Override
    public int priority() {
        return 21;
    }

    @Override
    public String buildQuery() {
        return """
                SELECT
                    CAST(s.SESS_ID AS VARCHAR(32)) AS session_id,
                    s.USER_NAME AS user_name,
                    COALESCE(s.CLNT_HOST, s.CLNT_IP, '') AS client_host,
                    COALESCE(s.CURR_SCH, '') AS database_name,
                    COALESCE(s.STATE, '') AS session_state,
                    COALESCE(s.APPNAME, '') AS command,
                    GREATEST(0, DATEDIFF(SS, s.CREATE_TIME, SYSDATE)) AS duration_sec,
                    COALESCE(SUBSTR(s.SQL_TEXT, 1, 4000), '') AS current_sql
                FROM V$SESSIONS s
                WHERE s.USER_NAME IS NOT NULL
                  AND s.SESS_ID <> SESSID()
                ORDER BY duration_sec DESC
                """;
    }

    @Override
    public String buildSelfSessionIdQuery() {
        return "SELECT CAST(SESSID() AS VARCHAR(32)) AS session_id FROM DUAL";
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
                    CAST(w.SESS_ID AS VARCHAR(32)) AS waiting_session_id,
                    w.USER_NAME AS waiting_user,
                    COALESCE(SUBSTR(w.SQL_TEXT, 1, 4000), '') AS waiting_sql,
                    CAST(b.SESS_ID AS VARCHAR(32)) AS blocking_session_id,
                    b.USER_NAME AS blocking_user,
                    COALESCE(SUBSTR(b.SQL_TEXT, 1, 4000), '') AS blocking_sql,
                    GREATEST(0, DATEDIFF(SS, w.CREATE_TIME, SYSDATE)) AS wait_seconds
                FROM V$TRXWAIT tw
                JOIN V$SESSIONS w ON w.TRX_ID = tw.ID
                JOIN V$SESSIONS b ON b.TRX_ID = tw.WAIT_FOR_ID
                WHERE w.SESS_ID <> SESSID()
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
        if (!DM_SESSION_ID.matcher(trimmed).matches()) {
            throw new IllegalArgumentException("Invalid sessionId: " + sessionId);
        }
        return "CALL SP_CLOSE_SESSION(" + trimmed + ")";
    }
}
