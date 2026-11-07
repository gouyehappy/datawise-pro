package org.apache.datawise.backend.ai.analysis.route;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.support.AiAnalysisLlmResolver;
import org.apache.datawise.backend.ai.support.AiLlmGateway;
import org.apache.datawise.backend.ai.support.AiPromptTemplates;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiAnalysisStepRoute;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 根据分析模式（快速 / 智能 / 自定义）规划当次禁用的可选步骤
 */
@Component
public class AiAnalysisStepRouteService {

    private static final Logger log = LoggerFactory.getLogger(AiAnalysisStepRouteService.class);

    private static final Pattern COMPLEX_INTENT = Pattern.compile(
            "(完整|详细|深入|报告|对比|预测|回归|相关|建模|python|forecast|regression|report|deep|comprehensive)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern CHART_INTENT = Pattern.compile(
            "(图|趋势|占比|分布|chart|trend|visual)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern PYTHON_INTENT = Pattern.compile(
            "(预测|回归|相关|统计检验|机器学习|python|forecast|regression|correlation)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private static final Set<String> CONFIGURABLE_IDS = Set.copyOf(AiAnalysisSteps.CONFIGURABLE);

    private final AiLlmGateway aiLlmGateway;
    private final ObjectMapper objectMapper;

    public AiAnalysisStepRouteService(AiLlmGateway aiLlmGateway, ObjectMapper objectMapper) {
        this.aiLlmGateway = aiLlmGateway;
        this.objectMapper = objectMapper;
    }

    public List<String> quickDisabledSteps() {
        return AiAnalysisSteps.QUICK_DISABLED;
    }

    public AiAnalysisStepRoute planQuick() {
        return new AiAnalysisStepRoute(
                quickDisabledSteps(),
                "快速分析：固定跳过规划、知识召回、Python、图表与完整报告"
        );
    }

    public AiAnalysisStepRoute planCustom(AiChatRequest request) {
        List<String> disabled = request != null && request.disabledAnalysisSteps() != null
                ? request.disabledAnalysisSteps()
                : List.of();
        return sanitize(new AiAnalysisStepRoute(
                List.copyOf(disabled),
                "自定义：使用 DataAgent 配置中的步骤开关"
        ));
    }

    public AiAnalysisStepRoute planSmart(AiChatRequest request, String prompt) {
        if (aiLlmGateway.isMock(AiAnalysisLlmResolver.resolve(request, AiAnalysisLlmResolver.ROUTE_PLANNING))) {
            return mockRoute(prompt);
        }
        String systemPrompt = AiPromptTemplates.renderAnalysisStepRouteSystemPrompt();
        String userPrompt = AiPromptTemplates.renderAnalysisStepRouteUserPrompt(
                prompt,
                request.targets() != null ? request.targets().size() : 0
        );
        String raw = aiLlmGateway.complete(
                AiAnalysisLlmResolver.resolve(request, AiAnalysisLlmResolver.ROUTE_PLANNING),
                systemPrompt,
                userPrompt,
                "analysis-step-route"
        );
        return parseRoute(raw, prompt);
    }

    AiAnalysisStepRoute parseRoute(String raw, String promptFallback) {
        if (raw == null || raw.isBlank()) {
            return mockRoute(promptFallback);
        }
        try {
            String json = extractJsonObject(raw);
            JsonNode root = objectMapper.readTree(json);
            List<String> disabled = new ArrayList<>();
            JsonNode stepsNode = root.get("disabledSteps");
            if (stepsNode != null && stepsNode.isArray()) {
                for (JsonNode item : stepsNode) {
                    if (item != null && item.isTextual()) {
                        disabled.add(item.asText());
                    }
                }
            }
            String rationale = root.path("rationale").asText("已根据问题选择分析步骤");
            return sanitize(new AiAnalysisStepRoute(disabled, rationale));
        } catch (Exception ex) {
            ExceptionLogging.recoverable(log, "AI step route LLM parse failed, using mock route", ex);
            return mockRoute(promptFallback);
        }
    }

    private AiAnalysisStepRoute mockRoute(String prompt) {
        String text = prompt != null ? prompt : "";
        Set<String> disabled = new LinkedHashSet<>(AiAnalysisSteps.QUICK_DISABLED);
        if (COMPLEX_INTENT.matcher(text).find()) {
            disabled.remove(AiAnalysisSteps.PLANNER);
            disabled.remove(AiAnalysisSteps.EVIDENCE);
            disabled.remove(AiAnalysisSteps.REPORT);
        }
        if (CHART_INTENT.matcher(text).find()) {
            disabled.remove(AiAnalysisSteps.CHART);
        }
        if (PYTHON_INTENT.matcher(text).find()) {
            disabled.remove("python");
        }
        return sanitize(new AiAnalysisStepRoute(
                List.copyOf(disabled),
                "演示模式：根据问题关键词选择步骤"
        ));
    }

    AiAnalysisStepRoute sanitize(AiAnalysisStepRoute route) {
        Set<String> disabled = new LinkedHashSet<>();
        for (String step : route.disabledSteps()) {
            String normalized = AiAnalysisSteps.normalize(step);
            if (normalized.isBlank() || !CONFIGURABLE_IDS.contains(normalized)) {
                continue;
            }
            disabled.add(normalized);
            if ("python".equals(normalized)) {
                disabled.add(AiAnalysisSteps.PYTHON_GENERATE);
                disabled.add(AiAnalysisSteps.PYTHON_EXECUTE);
                disabled.add(AiAnalysisSteps.PYTHON_ANALYZE);
            }
        }
        if (disabled.contains(AiAnalysisSteps.SUMMARY) && disabled.contains(AiAnalysisSteps.REPORT)) {
            disabled.remove(AiAnalysisSteps.SUMMARY);
        }
        return new AiAnalysisStepRoute(List.copyOf(disabled), route.rationale());
    }

    private static String extractJsonObject(String raw) {
        String trimmed = AiLlmGateway.stripCodeFence(raw).trim();
        int start = trimmed.indexOf('{');
        int end = trimmed.lastIndexOf('}');
        if (start < 0 || end <= start) {
            throw new IllegalArgumentException("No JSON object in LLM step-route reply");
        }
        return trimmed.substring(start, end + 1);
    }

    public static String normalizeMode(String mode) {
        if (mode == null || mode.isBlank()) {
            return "smart";
        }
        return mode.trim().toLowerCase(Locale.ROOT);
    }
}
