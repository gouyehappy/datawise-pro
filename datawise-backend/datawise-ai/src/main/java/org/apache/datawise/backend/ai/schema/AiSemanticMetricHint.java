package org.apache.datawise.backend.ai.schema;

/**
 * 语义层指标摘要，供 LLM SQL 生成时引用业务定义。
 */
public record AiSemanticMetricHint(
        String name,
        String expression,
        String description,
        String unit
) {
}
