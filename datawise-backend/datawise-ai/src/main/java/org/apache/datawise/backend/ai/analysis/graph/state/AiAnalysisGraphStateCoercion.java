package org.apache.datawise.backend.ai.analysis.graph.state;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.graph.state.coercion.AiAnalysisArtifactCoercion;
import org.apache.datawise.backend.ai.analysis.graph.state.coercion.AiChatRequestCoercion;
import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.apache.datawise.backend.ai.domain.AiAnalysisReportDto;
import org.apache.datawise.backend.ai.domain.AiChartSpecDto;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;

/**
 * 从 StateGraph {@link OverAllState} 读取强类型字段。
 * 底层 Map → DTO 转换见 {@code graph.state.coercion} 包。
 */
public final class AiAnalysisGraphStateCoercion {

    private AiAnalysisGraphStateCoercion() {
    }

    public static AiChatRequest requireRequest(OverAllState state) {
        AiChatRequest request = AiChatRequestCoercion.chatRequest(state.value(AiAnalysisGraphKeys.REQUEST).orElse(null));
        if (request == null) {
            throw new IllegalArgumentException("Analysis request missing in graph state");
        }
        return request;
    }

    public static ExecuteSqlResult requireExecuteResult(OverAllState state) {
        ExecuteSqlResult result = executeResult(state.value(AiAnalysisGraphKeys.EXECUTE_RESULT).orElse(null));
        if (result == null) {
            throw new IllegalStateException("Execute result missing before downstream node");
        }
        return result;
    }

    public static AiChartSpecDto chart(OverAllState state) {
        return chart(state.value(AiAnalysisGraphKeys.CHART).orElse(null));
    }

    public static AiSqlSchemaContext schema(OverAllState state) {
        AiSqlSchemaContext schema = schemaContext(state.value(AiAnalysisGraphKeys.SCHEMA).orElse(null));
        if (schema == null) {
            throw new IllegalStateException("Schema missing before sql_generate");
        }
        return schema;
    }

    public static AiEvidenceBundle evidence(OverAllState state, String promptFallback) {
        AiEvidenceBundle evidence = evidenceBundle(state.value(AiAnalysisGraphKeys.EVIDENCE).orElse(null));
        return evidence != null ? evidence : AiEvidenceBundle.empty(promptFallback);
    }

    /**
     * 供测试与 ReplyExtractor 直接调用
     */
    public static AiChatRequest chatRequest(Object raw) {
        return AiChatRequestCoercion.chatRequest(raw);
    }

    public static ExecuteSqlResult executeResult(Object raw) {
        return AiAnalysisArtifactCoercion.executeResult(raw);
    }

    public static AiChartSpecDto chart(Object raw) {
        return AiAnalysisArtifactCoercion.chart(raw);
    }

    public static AiAnalysisReportDto report(Object raw) {
        return AiAnalysisArtifactCoercion.report(raw);
    }

    private static AiSqlSchemaContext schemaContext(Object raw) {
        return AiAnalysisArtifactCoercion.schemaContext(raw);
    }

    private static AiEvidenceBundle evidenceBundle(Object raw) {
        return AiAnalysisArtifactCoercion.evidenceBundle(raw);
    }
}
