package org.apache.datawise.backend.ai.analysis;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * DataAgent 流水线步骤 id（与 StateGraph 节点、前端 {@code AI_ANALYSIS_STEP_ORDER} 对齐）。
 */
public final class AiAnalysisSteps {

    public static final String INTENT = "intent";
    public static final String STEP_ROUTE = "step_route";
    public static final String PLANNER = "planner";
    public static final String EVIDENCE = "evidence";
    public static final String SCHEMA = "schema";
    public static final String SQL_GENERATE = "sql_generate";
    public static final String SQL_VALIDATE = "sql_validate";
    public static final String SQL_EXECUTE = "sql_execute";
    public static final String PYTHON_GENERATE = "python_generate";
    public static final String PYTHON_EXECUTE = "python_execute";
    public static final String PYTHON_ANALYZE = "python_analyze";
    public static final String CHART = "chart";
    public static final String SUMMARY = "summary";
    public static final String REPORT = "report";

    /**
     * 完整流水线顺序（含路由与可选步骤）
     */
    public static final List<String> PIPELINE_ORDER = List.of(
            INTENT,
            STEP_ROUTE,
            PLANNER,
            EVIDENCE,
            SCHEMA,
            SQL_GENERATE,
            SQL_VALIDATE,
            SQL_EXECUTE,
            PYTHON_GENERATE,
            PYTHON_EXECUTE,
            PYTHON_ANALYZE,
            CHART,
            SUMMARY,
            REPORT
    );

    /**
     * 可在设置 / step_route 中禁用的可选步骤
     */
    public static final List<String> CONFIGURABLE = List.of(
            PLANNER,
            EVIDENCE,
            SQL_VALIDATE,
            "python",
            CHART,
            SUMMARY,
            REPORT
    );

    /**
     * 快速分析模式固定跳过项
     */
    public static final List<String> QUICK_DISABLED = List.of(
            PLANNER,
            EVIDENCE,
            "python",
            CHART,
            REPORT
    );

    /**
     * 必选步骤，不可被路由禁用
     */
    public static final Set<String> REQUIRED = Set.of(
            INTENT,
            SCHEMA,
            SQL_GENERATE,
            SQL_EXECUTE
    );

    private AiAnalysisSteps() {
    }

    public static String normalize(String step) {
        if (step == null) {
            return "";
        }
        return step.trim().toLowerCase(Locale.ROOT).replace('-', '_');
    }

    public static boolean isPythonStep(String step) {
        return PYTHON_GENERATE.equals(step)
                || PYTHON_EXECUTE.equals(step)
                || PYTHON_ANALYZE.equals(step);
    }

    /**
     * 将配置项（含 {@code python} 别名）展开为图节点 id 集合
     */
    public static Set<String> expandDisabled(List<String> steps) {
        Set<String> disabled = new LinkedHashSet<>();
        if (steps == null) {
            return disabled;
        }
        for (String step : steps) {
            if (step == null || step.isBlank()) {
                continue;
            }
            String normalized = normalize(step);
            disabled.add(normalized);
            if ("python".equals(normalized)) {
                disabled.add(PYTHON_GENERATE);
                disabled.add(PYTHON_EXECUTE);
                disabled.add(PYTHON_ANALYZE);
            }
        }
        return disabled;
    }

    public static String configPropertyKey(String step) {
        return SQL_VALIDATE.equals(step) ? "sqlValidate" : step;
    }
}
