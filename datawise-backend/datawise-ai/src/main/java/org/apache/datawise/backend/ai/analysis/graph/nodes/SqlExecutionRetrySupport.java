package org.apache.datawise.backend.ai.analysis.graph.nodes;

import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.schema.AiSchemaContextService;
import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.apache.datawise.backend.ai.support.AiSqlReferencedTables;
import org.apache.datawise.backend.ai.support.AiSqlSemanticChecker;
import org.apache.datawise.backend.ai.support.AiSqlSafetyChecker;
import org.apache.datawise.backend.ai.domain.AiAnalysisContextDto;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SQL 执行失败后的单次修正：拉取引用表 DDL → 重新生成 → 只读校验。
 * 由 {@link SqlExecuteAnalysisNode} 在节点内调用，不回到 sql_generate 图节点，避免二次 SQL 确认。
 */
@Component
public class SqlExecutionRetrySupport {

    private final AnalysisSqlGenerator sqlGenerator;
    private final AiSchemaContextService schemaContextService;

    public SqlExecutionRetrySupport(
            AnalysisSqlGenerator sqlGenerator,
            AiSchemaContextService schemaContextService
    ) {
        this.sqlGenerator = sqlGenerator;
        this.schemaContextService = schemaContextService;
    }

    public String regenerateValidatedSql(
            AiLlmProfileDto llm,
            String prompt,
            String connectionId,
            String database,
            AiEvidenceBundle evidence,
            AiAnalysisContextDto analysisContext,
            String failedSql,
            String executionError,
            Integer errorLine
    ) {
        long generateStart = AnalysisStepRunner.start();
        AnalysisStepRunner.running(AiAnalysisSteps.SQL_GENERATE, "根据表结构修正 SQL");

        List<String> referencedTables = AiSqlReferencedTables.extract(failedSql);
        AiSqlSchemaContext schema = schemaContextService.buildForTables(
                connectionId,
                database,
                referencedTables,
                evidence
        );

        String sql = sqlGenerator.regenerateAfterExecutionError(
                llm,
                prompt,
                schema,
                evidence,
                analysisContext,
                failedSql,
                executionError,
                errorLine
        );

        Map<String, Object> sqlDetail = new LinkedHashMap<>();
        sqlDetail.put("sqlChars", sql != null ? sql.length() : 0);
        sqlDetail.put("referencedTables", referencedTables);
        AnalysisStepRunner.ok(
                AiAnalysisSteps.SQL_GENERATE,
                "已根据表结构修正 SQL",
                generateStart,
                sqlDetail
        );

        long validateStart = AnalysisStepRunner.start();
        AnalysisStepRunner.running(AiAnalysisSteps.SQL_VALIDATE, "校验修正后的 SQL");
        try {
            String safeSql = AiSqlSafetyChecker.requireReadOnlySelect(sql);
            Map<String, Object> validateDetail = new LinkedHashMap<>();
            validateDetail.put("safe", true);
            AiSqlSemanticChecker.SemanticCheckResult semantic = AiSqlSemanticChecker.check(safeSql, schema);
            validateDetail.put("semanticOk", semantic.ok());
            if (!semantic.ok()) {
                throw new IllegalStateException(semantic.message());
            }
            AnalysisStepRunner.ok(
                    AiAnalysisSteps.SQL_VALIDATE,
                    "SQL 校验通过",
                    validateStart,
                    validateDetail
            );
            return safeSql;
        } catch (RuntimeException ex) {
            AnalysisStepRunner.failed(AiAnalysisSteps.SQL_VALIDATE, ex);
            throw ex;
        }
    }
}
