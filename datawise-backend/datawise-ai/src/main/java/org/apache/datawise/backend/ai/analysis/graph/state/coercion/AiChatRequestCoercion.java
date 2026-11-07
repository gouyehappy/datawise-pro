package org.apache.datawise.backend.ai.analysis.graph.state.coercion;

import org.apache.datawise.backend.ai.domain.AiAnalysisContextDto;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiDatabaseTargetDto;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.apache.datawise.backend.ai.analysis.graph.state.coercion.GraphStateValueCoercion.boolValue;
import static org.apache.datawise.backend.ai.analysis.graph.state.coercion.GraphStateValueCoercion.castStringList;
import static org.apache.datawise.backend.ai.analysis.graph.state.coercion.GraphStateValueCoercion.intValue;
import static org.apache.datawise.backend.ai.analysis.graph.state.coercion.GraphStateValueCoercion.stringValue;

/**
 * 将 checkpoint 中的 request / target / llm 等 Map 还原为 DTO
 */
public final class AiChatRequestCoercion {

    private AiChatRequestCoercion() {
    }

    public static AiChatRequest chatRequest(Object raw) {
        if (raw instanceof AiChatRequest request) {
            return request;
        }
        if (!(raw instanceof Map<?, ?> map)) {
            return null;
        }
        List<AiDatabaseTargetDto> targets = new ArrayList<>();
        Object targetsRaw = map.get("targets");
        if (targetsRaw instanceof List<?> list) {
            for (Object item : list) {
                AiDatabaseTargetDto target = databaseTarget(item);
                if (target != null) {
                    targets.add(target);
                }
            }
        }
        return new AiChatRequest(
                stringValue(map.get("prompt")),
                targets,
                llmProfile(map.get("llm")),
                analysisContext(map.get("analysisContext")),
                boolValue(map.get("skipSqlConfirmation")),
                castStringList(map.get("disabledAnalysisSteps")),
                stringValue(map.get("analysisMode")),
                stepLlms(map.get("stepLlms"))
        );
    }

    private static Map<String, AiLlmProfileDto> stepLlms(Object raw) {
        if (!(raw instanceof Map<?, ?> map) || map.isEmpty()) {
            return Map.of();
        }
        Map<String, AiLlmProfileDto> resolved = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (entry.getKey() == null) {
                continue;
            }
            AiLlmProfileDto profile = llmProfile(entry.getValue());
            if (profile != null) {
                resolved.put(String.valueOf(entry.getKey()), profile);
            }
        }
        return resolved;
    }

    public static AiDatabaseTargetDto databaseTarget(Object raw) {
        if (raw instanceof AiDatabaseTargetDto target) {
            return target;
        }
        if (!(raw instanceof Map<?, ?> map)) {
            return null;
        }
        String tableLabel = stringValue(map.get("tableLabel"));
        if (tableLabel == null) {
            tableLabel = stringValue(map.get("schema"));
        }
        return new AiDatabaseTargetDto(
                stringValue(map.get("connectionId")),
                stringValue(map.get("connectionLabel")),
                stringValue(map.get("database")),
                stringValue(map.get("databaseLabel")),
                tableLabel,
                stringValue(map.get("dbType"))
        );
    }

    public static AiLlmProfileDto llmProfile(Object raw) {
        if (raw instanceof AiLlmProfileDto profile) {
            return profile;
        }
        if (!(raw instanceof Map<?, ?> map)) {
            return null;
        }
        return new AiLlmProfileDto(
                stringValue(map.get("provider")),
                stringValue(map.get("baseUrl")),
                stringValue(map.get("apiKey")),
                stringValue(map.get("model")),
                GraphStateValueCoercion.doubleObject(map.get("temperature")),
                intValue(map.get("maxTokens")),
                stringValue(map.get("completionsPath"))
        );
    }

    public static AiAnalysisContextDto analysisContext(Object raw) {
        if (raw instanceof AiAnalysisContextDto context) {
            return context;
        }
        if (!(raw instanceof Map<?, ?> map)) {
            return null;
        }
        return new AiAnalysisContextDto(
                stringValue(map.get("previousSql")),
                stringValue(map.get("previousSummary")),
                stringValue(map.get("previousChartType"))
        );
    }
}
