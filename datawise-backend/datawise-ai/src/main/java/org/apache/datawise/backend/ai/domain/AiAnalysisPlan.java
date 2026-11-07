package org.apache.datawise.backend.ai.domain;

import java.util.List;

/**
 * 分析执行计划（Planner 节点输出）
 */
public record AiAnalysisPlan(
        String mode,
        boolean requiresPython,
        boolean federated,
        List<String> targetLabels
) {
    public static final String MODE_SQL_ONLY = "SQL_ONLY";
    public static final String MODE_SQL_THEN_PYTHON = "SQL_THEN_PYTHON";
    public static final String MODE_FEDERATED = "FEDERATED";

    public static AiAnalysisPlan sqlOnly(List<String> targetLabels) {
        return new AiAnalysisPlan(MODE_SQL_ONLY, false, false, targetLabels != null ? targetLabels : List.of());
    }
}
