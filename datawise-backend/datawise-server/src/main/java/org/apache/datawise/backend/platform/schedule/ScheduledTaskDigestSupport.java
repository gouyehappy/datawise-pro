package org.apache.datawise.backend.platform.schedule;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.datawise.backend.domain.ExecuteSqlResult;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Insight digest helpers for scheduled SQL / canvas task outcomes.
 */
final class ScheduledTaskDigestSupport {

    static final int DEFAULT_DIGEST_MAX_ROWS = 20;
    static final int HARD_DIGEST_MAX_ROWS = 50;

    private ScheduledTaskDigestSupport() {
    }

    static Map<String, Object> buildSqlDigest(ExecuteSqlResult result, int digestMaxRows) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("rowCount", result.rowCount());
        List<String> columnNames = new ArrayList<>();
        if (result.columns() != null) {
            for (Map<String, Object> column : result.columns()) {
                if (column == null) {
                    continue;
                }
                Object name = column.get("name");
                if (name == null) {
                    name = column.get("key");
                }
                if (name != null && !name.toString().isBlank()) {
                    columnNames.add(name.toString());
                }
            }
        }
        data.put("columns", columnNames);
        List<Map<String, Object>> rows = result.rows() != null ? result.rows() : List.of();
        int limit = Math.min(digestMaxRows, rows.size());
        data.put("rows", rows.subList(0, limit));
        data.put("truncated", rows.size() > limit || Boolean.TRUE.equals(result.hasMore()));
        return data;
    }

    static int resolveDigestMaxRows(JsonNode payload) {
        int value = payload.has("digestMaxRows")
                ? payload.get("digestMaxRows").asInt(DEFAULT_DIGEST_MAX_ROWS)
                : DEFAULT_DIGEST_MAX_ROWS;
        if (value < 1) {
            return 1;
        }
        return Math.min(HARD_DIGEST_MAX_ROWS, value);
    }

    static String clip(String value, int maxChars) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        if (trimmed.length() <= maxChars) {
            return trimmed;
        }
        return trimmed.substring(0, Math.max(0, maxChars - 3)) + "...";
    }

    static Map<String, Object> buildCanvasDigest(
            String canvasId,
            String title,
            int rowCount,
            String summary,
            String sql,
            int digestMaxRows
    ) {
        int summaryMaxChars = Math.min(2000, Math.max(200, digestMaxRows * 40));
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("canvasId", canvasId != null ? canvasId : "");
        data.put("title", title != null ? title : "");
        data.put("rowCount", rowCount);
        data.put("digestMaxRows", digestMaxRows);
        String resolvedSummary = summary != null ? summary : "";
        boolean summaryTruncated = resolvedSummary.length() > summaryMaxChars;
        data.put("summary", clip(resolvedSummary, summaryMaxChars));
        data.put("summaryTruncated", summaryTruncated);
        if (sql != null && !sql.isBlank()) {
            data.put("sql", clip(sql, Math.min(4000, summaryMaxChars * 2)));
        }
        return data;
    }
}
