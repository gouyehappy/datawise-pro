package org.apache.datawise.backend.platform.schedule;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.datawise.backend.domain.TeamSharedQueryDetailDto;
import org.apache.datawise.backend.service.InstanceWorkspaceService;
import org.apache.datawise.backend.service.TeamService;
import org.apache.datawise.sqlparser.support.SqlTextSupport;

import java.util.List;
import java.util.Locale;

/**
 * Resolves scheduled SQL task payload sources: inline SQL, workspace .sql file, or Query Library.
 */
final class ScheduledSqlPayloadSupport {

    static final String SOURCE_INLINE = "inline";
    static final String SOURCE_WORKSPACE_FILE = "workspace_file";
    static final String SOURCE_QUERY_LIBRARY = "query_library";

    private ScheduledSqlPayloadSupport() {
    }

    record ResolvedSql(
            String sql,
            String connectionId,
            String database,
            String source
    ) {
    }

    static ResolvedSql resolve(
            JsonNode payload,
            InstanceWorkspaceService instanceWorkspaceService,
            TeamService teamService
    ) throws Exception {
        String source = normalizeSource(payload);
        return switch (source) {
            case SOURCE_WORKSPACE_FILE -> resolveWorkspaceFile(payload, instanceWorkspaceService);
            case SOURCE_QUERY_LIBRARY -> resolveQueryLibrary(payload, teamService);
            default -> resolveInline(payload);
        };
    }

    static List<String> splitExecutableStatements(String sql) {
        List<String> statements = SqlTextSupport.splitStatements(sql == null ? "" : sql);
        if (statements.isEmpty() && sql != null && !sql.isBlank()) {
            return List.of(sql.trim());
        }
        return statements;
    }

    private static ResolvedSql resolveInline(JsonNode payload) {
        return new ResolvedSql(
                requiredText(payload, "sql"),
                requiredText(payload, "connectionId"),
                requiredText(payload, "database"),
                SOURCE_INLINE
        );
    }

    private static ResolvedSql resolveWorkspaceFile(
            JsonNode payload,
            InstanceWorkspaceService instanceWorkspaceService
    ) throws Exception {
        String connectionId = requiredText(payload, "connectionId");
        String database = requiredText(payload, "database");
        String sqlFile = requiredText(payload, "sqlFile");
        String sql = instanceWorkspaceService.readSql(connectionId, database, sqlFile);
        if (sql == null || sql.isBlank()) {
            throw new IllegalArgumentException("SQL file is empty: " + sqlFile);
        }
        return new ResolvedSql(sql, connectionId, database, SOURCE_WORKSPACE_FILE);
    }

    private static ResolvedSql resolveQueryLibrary(JsonNode payload, TeamService teamService) {
        String teamId = requiredText(payload, "teamId");
        String queryId = requiredText(payload, "queryId");
        TeamSharedQueryDetailDto detail = teamService.getSharedQuery(teamId, queryId);
        if (detail == null || detail.sql() == null || detail.sql().isBlank()) {
            throw new IllegalArgumentException("Query Library entry has no SQL: " + queryId);
        }
        String connectionId = optionalText(payload, "connectionId");
        if (connectionId == null) {
            connectionId = trimToNull(detail.connectionId());
        }
        String database = optionalText(payload, "database");
        if (database == null) {
            database = trimToNull(detail.database());
        }
        if (connectionId == null || database == null) {
            throw new IllegalArgumentException(
                    "connectionId and database are required (payload or Query Library entry)"
            );
        }
        return new ResolvedSql(detail.sql(), connectionId, database, SOURCE_QUERY_LIBRARY);
    }

    private static String normalizeSource(JsonNode payload) {
        String explicit = optionalText(payload, "source");
        if (explicit != null) {
            return explicit.toLowerCase(Locale.ROOT);
        }
        if (optionalText(payload, "sqlFile") != null) {
            return SOURCE_WORKSPACE_FILE;
        }
        if (optionalText(payload, "teamId") != null && optionalText(payload, "queryId") != null) {
            return SOURCE_QUERY_LIBRARY;
        }
        return SOURCE_INLINE;
    }

    static String requiredText(JsonNode node, String field) {
        String value = optionalText(node, field);
        if (value == null) {
            throw new IllegalArgumentException(field + " is required in payload");
        }
        return value;
    }

    static String optionalText(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull()) {
            return null;
        }
        return trimToNull(node.get(field).asText(""));
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
