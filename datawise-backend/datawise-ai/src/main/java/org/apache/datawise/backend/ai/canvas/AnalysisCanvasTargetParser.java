package org.apache.datawise.backend.ai.canvas;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.ai.analysis.graph.state.coercion.AiChatRequestCoercion;
import org.apache.datawise.backend.ai.domain.AiDatabaseTargetDto;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 将画布 {@code targetsJson} 解析为 AI 分析所需的 {@link AiDatabaseTargetDto} 列表。 */
public final class AnalysisCanvasTargetParser {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private AnalysisCanvasTargetParser() {
    }

    public static List<AiDatabaseTargetDto> parse(String targetsJson) {
        if (targetsJson == null || targetsJson.isBlank()) {
            return List.of();
        }
        try {
            List<Map<String, Object>> raw = MAPPER.readValue(
                    targetsJson,
                    new TypeReference<>() {
                    }
            );
            List<AiDatabaseTargetDto> targets = new ArrayList<>();
            for (Map<String, Object> item : raw) {
                AiDatabaseTargetDto target = fromFrontendTarget(item);
                if (target != null) {
                    targets.add(target);
                }
            }
            return targets;
        } catch (Exception ex) {
            return List.of();
        }
    }

    @SuppressWarnings("unchecked")
    private static AiDatabaseTargetDto fromFrontendTarget(Map<String, Object> item) {
        if (item == null || item.isEmpty()) {
            return null;
        }
        String connectionId = stringValue(item.get("connectionId"));
        String database = stringValue(item.get("database"));
        String databaseLabel = stringValue(item.get("databaseLabel"));
        String level = stringValue(item.get("level"));
        String compositeId = stringValue(item.get("id"));
        if (connectionId == null) {
            connectionId = resolveConnectionIdFromCompositeId(compositeId);
        }
        if (database == null) {
            database = resolveDatabaseLabel(databaseLabel, compositeId, level);
        }
        if (connectionId == null) {
            return AiChatRequestCoercion.databaseTarget(item);
        }
        Map<String, Object> normalized = new java.util.LinkedHashMap<>(item);
        normalized.putIfAbsent("connectionId", connectionId);
        if (database != null) {
            normalized.putIfAbsent("database", database);
        }
        if (databaseLabel != null) {
            normalized.putIfAbsent("databaseLabel", databaseLabel);
        }
        return AiChatRequestCoercion.databaseTarget(normalized);
    }

    private static String resolveConnectionIdFromCompositeId(String compositeId) {
        if (compositeId == null || compositeId.isBlank()) {
            return null;
        }
        int colon = compositeId.indexOf(':');
        return colon > 0 ? compositeId.substring(0, colon) : null;
    }

    private static String resolveDatabaseLabel(String databaseLabel, String compositeId, String level) {
        if (databaseLabel != null && !databaseLabel.isBlank()) {
            return databaseLabel;
        }
        if (compositeId == null || compositeId.isBlank()) {
            return null;
        }
        String[] parts = compositeId.split(":", 3);
        if (parts.length < 2) {
            return null;
        }
        String databaseId = parts[1];
        if ("__conn__".equals(databaseId) || "connection".equals(level)) {
            return "";
        }
        return databaseId;
    }

    private static String stringValue(Object raw) {
        if (raw == null) {
            return null;
        }
        String value = String.valueOf(raw).trim();
        return value.isEmpty() ? null : value;
    }
}
