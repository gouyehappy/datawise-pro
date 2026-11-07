package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.support.AiAnalysisLlmResolver;
import org.apache.datawise.backend.ai.support.AiCallLogger;
import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 步骤 4/8：基于 schema + evidence 生成 SQL（写入 SQL，尚未校验）。
 * validate 失败回退时会读取 {@link AiAnalysisGraphKeys#VALIDATION_ERROR} 修正生成。
 */
@Component
public class SqlGenerateAnalysisNode {

    private static final Logger log = LoggerFactory.getLogger(SqlGenerateAnalysisNode.class);

    private final AnalysisSqlGenerator sqlGenerator;

    public SqlGenerateAnalysisNode(AnalysisSqlGenerator sqlGenerator) {
        this.sqlGenerator = sqlGenerator;
    }

    public Map<String, Object> execute(OverAllState state) {
        AiChatRequest request = AiAnalysisGraphStateCoercion.requireRequest(state);
        var sqlLlm = AiAnalysisLlmResolver.resolve(request, AiAnalysisLlmResolver.ROUTE_SQL);
        String prompt = state.value(AiAnalysisGraphKeys.PROMPT, "");
        AiSqlSchemaContext schema = AiAnalysisGraphStateCoercion.schema(state);
        AiEvidenceBundle evidence = AiAnalysisGraphStateCoercion.evidence(state, prompt);
        int retryCount = state.value(AiAnalysisGraphKeys.SQL_RETRY_COUNT, 0);
        String failedSql = state.value(AiAnalysisGraphKeys.SQL, "");
        String validationError = state.value(AiAnalysisGraphKeys.VALIDATION_ERROR, "");
        boolean validationRetry = retryCount > 0
                && validationError != null
                && !validationError.isBlank();

        long stepStart = AnalysisStepRunner.start();
        String runningMessage = validationRetry ? "根据校验错误修正 SQL" : "生成 SQL";
        AnalysisStepRunner.running(AiAnalysisSteps.SQL_GENERATE, runningMessage);
        try {
            String sql = validationRetry
                    ? sqlGenerator.regenerateAfterValidationError(
                    sqlLlm,
                    prompt,
                    schema,
                    evidence,
                    request.analysisContext(),
                    failedSql,
                    validationError
            )
                    : sqlGenerator.generate(
                    sqlLlm,
                    prompt,
                    schema,
                    evidence,
                    request.analysisContext()
            );

            Map<String, Object> sqlDetail = new LinkedHashMap<>();
            sqlDetail.put("sqlChars", sql != null ? sql.length() : 0);
            sqlDetail.put("validationRetry", validationRetry);
            if (validationRetry) {
                sqlDetail.put("retryCount", retryCount);
            }
            String okMessage = validationRetry ? "已根据校验错误修正 SQL" : "SQL 已生成";
            AnalysisStepRunner.ok(AiAnalysisSteps.SQL_GENERATE, okMessage, stepStart, sqlDetail);
            AiCallLogger.logAnalysisStep(
                    log,
                    validationRetry ? "sql-regenerated" : "sql-generated",
                    "sqlChars",
                    sqlDetail.get("sqlChars")
            );

            return Map.of(AiAnalysisGraphKeys.SQL, sql);
        } catch (RuntimeException ex) {
            AnalysisStepRunner.failed(AiAnalysisSteps.SQL_GENERATE, ex);
            throw new IllegalStateException("SQL 生成失败: " + AnalysisStepRunner.messageOf(ex), ex);
        }
    }
}
