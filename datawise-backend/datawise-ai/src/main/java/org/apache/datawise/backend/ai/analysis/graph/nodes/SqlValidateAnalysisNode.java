package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepGate;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.config.AiAnalysisProperties;
import org.apache.datawise.backend.ai.support.AiSqlSafetyChecker;
import org.apache.datawise.backend.ai.support.AiSqlSemanticChecker;
import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 步骤 5/8：校验 SQL 必须为只读 SELECT，并进行轻量语义/表引用检查。
 * 失败时递增 SQL_RETRY_COUNT，由 {@link org.apache.datawise.backend.ai.analysis.graph.runtime.AiAnalysisValidateRouter} 决定是否回到 sql_generate。
 */
@Component
public class SqlValidateAnalysisNode {

    private final AiAnalysisProperties analysisProperties;
    private final AnalysisStepGate stepGate;

    public SqlValidateAnalysisNode(AiAnalysisProperties analysisProperties, AnalysisStepGate stepGate) {
        this.analysisProperties = analysisProperties;
        this.stepGate = stepGate;
    }

    public Map<String, Object> execute(OverAllState state) {
        String sql = state.value(AiAnalysisGraphKeys.SQL, "");
        var skipped = stepGate.skipUnlessEnabled(
                AiAnalysisSteps.SQL_VALIDATE,
                state,
                Map.of(
                        AiAnalysisGraphKeys.SAFE_SQL, sql,
                        AiAnalysisGraphKeys.VALIDATION_OK, true,
                        AiAnalysisGraphKeys.VALIDATION_ERROR, ""
                )
        );
        if (skipped.isPresent()) {
            return skipped.get();
        }
        AiSqlSchemaContext schema = AiAnalysisGraphStateCoercion.schema(state);
        long stepStart = AnalysisStepRunner.start();

        AnalysisStepRunner.running(AiAnalysisSteps.SQL_VALIDATE, "校验只读 SQL 与列引用");
        try {
            String safeSql = AiSqlSafetyChecker.requireReadOnlySelect(sql);
            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("safe", true);

            if (analysisProperties.isSemanticCheckEnabled()) {
                AiSqlSemanticChecker.SemanticCheckResult semantic =
                        AiSqlSemanticChecker.check(safeSql, schema);
                detail.put("semanticOk", semantic.ok());
                if (!semantic.ok()) {
                    if (analysisProperties.isSemanticCheckStrict() || semantic.columnIssue()) {
                        throw new IllegalStateException(semantic.message());
                    }
                    detail.put("semanticWarning", semantic.message());
                }
            }

            AnalysisStepRunner.ok(
                    AiAnalysisSteps.SQL_VALIDATE,
                    "SQL 校验通过",
                    stepStart,
                    detail
            );
            Map<String, Object> updates = new LinkedHashMap<>();
            updates.put(AiAnalysisGraphKeys.SAFE_SQL, safeSql);
            updates.put(AiAnalysisGraphKeys.VALIDATION_OK, true);
            updates.put(AiAnalysisGraphKeys.VALIDATION_ERROR, "");
            return updates;
        } catch (RuntimeException ex) {
            int retryCount = state.value(AiAnalysisGraphKeys.SQL_RETRY_COUNT, 0);
            AnalysisStepRunner.failed(AiAnalysisSteps.SQL_VALIDATE, ex);

            Map<String, Object> updates = new LinkedHashMap<>();
            updates.put(AiAnalysisGraphKeys.VALIDATION_OK, false);
            updates.put(AiAnalysisGraphKeys.VALIDATION_ERROR, AnalysisStepRunner.messageOf(ex));
            updates.put(AiAnalysisGraphKeys.SQL_RETRY_COUNT, retryCount + 1);
            return updates;
        }
    }
}
