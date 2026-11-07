package org.apache.datawise.backend.ops.render;

import org.apache.datawise.backend.domain.ActiveSessionDto;
import org.apache.datawise.backend.domain.ExecuteSqlResult;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** 活跃会话结果解析（MySQL PROCESSLIST 与标准列布局）。 */
public final class ActiveSessionResultParsing {

    private ActiveSessionResultParsing() {
    }

    public static List<ActiveSessionDto> parse(
                                               ExecuteSqlResult result,
                                               String excludeSessionId,
                                               boolean mysqlProcessListLayout) {
        if (result == null || result.rows() == null) {
            return List.of();
        }
        List<Map<String, Object>> columns = result.columns() != null ? result.columns() : List.of();
        List<ActiveSessionDto> sessions = new ArrayList<>();
        for (Map<String, Object> row : result.rows()) {
            ActiveSessionDto session = mysqlProcessListLayout
                    ? parseMysqlRow(row, columns)
                    : parseStandardRow(row, columns);
            if (session == null) {
                continue;
            }
            if (excludeSessionId != null && excludeSessionId.equals(session.sessionId())) {
                continue;
            }
            if (isMonitoringQuery(session.sql())) {
                continue;
            }
            sessions.add(session);
        }
        return sessions;
    }

    public static String readSelfSessionId(ExecuteSqlResult result) {
        if (result == null || result.rows() == null || result.rows().isEmpty()) {
            return null;
        }
        List<Map<String, Object>> columns = result.columns() != null ? result.columns() : List.of();
        Object value = OpsRowParsing.cell(result.rows().get(0), columns, "session_id");
        String sessionId = OpsRowParsing.asString(value);
        return sessionId.isBlank() ? null : sessionId;
    }

    private static boolean isMonitoringQuery(String sql) {
        String normalized = sql.trim().toUpperCase(Locale.ROOT);
        if (normalized.isEmpty()) {
            return false;
        }
        return normalized.startsWith("SHOW FULL PROCESSLIST")
                || normalized.startsWith("SHOW PROCESSLIST")
                || normalized.contains("PG_STAT_ACTIVITY")
                || normalized.contains("PG_BLOCKING_PIDS")
                || normalized.contains("DATA_LOCK_WAITS")
                || normalized.contains("INNODB_LOCK_WAITS")
                || normalized.contains("CONNECTION_ID()");
    }

    private static ActiveSessionDto parseMysqlRow(Map<String, Object> row, List<Map<String, Object>> columns) {
        String sessionId = OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "Id", "id", "session_id"));
        if (sessionId.isBlank()) {
            return null;
        }
        return new ActiveSessionDto(
                sessionId,
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "User", "user", "user_name")),
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "Host", "host", "client_host")),
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "db", "database", "database_name")),
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "State", "state", "session_state")),
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "Command", "command")),
                OpsRowParsing.asLong(OpsRowParsing.cell(row, columns, "Time", "time", "duration_sec")),
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "Info", "info", "current_sql", "query")));
    }

    private static ActiveSessionDto parseStandardRow(Map<String, Object> row, List<Map<String, Object>> columns) {
        String sessionId = OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "session_id", "pid", "Id", "id"));
        if (sessionId.isBlank()) {
            return null;
        }
        return new ActiveSessionDto(
                sessionId,
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "user_name", "User", "user", "login_name")),
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "client_host", "Host", "host", "host_name")),
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "database_name", "db", "database", "datname")),
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "session_state", "State", "state", "status")),
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "command", "Command", "backend_type")),
                OpsRowParsing.asLong(OpsRowParsing.cell(row, columns, "duration_sec", "Time", "time", "total_elapsed_time")),
                OpsRowParsing.asString(OpsRowParsing.cell(row, columns, "current_sql", "Info", "info", "query", "text")));
    }
}
