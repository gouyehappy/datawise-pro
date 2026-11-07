package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.config.AiAnalysisProperties;
import org.apache.datawise.backend.ai.support.AiAnalysisLlmResolver;
import org.apache.datawise.backend.ai.support.AiCallLogger;
import org.apache.datawise.backend.common.SqlExecutionException;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;
import org.apache.datawise.backend.ai.analysis.federated.FederatedSqlExecutionSupport;
import org.apache.datawise.backend.ai.analysis.graph.support.AiAnalysisPlanReader;
import org.apache.datawise.backend.ai.domain.AiAnalysisPlan;
import org.apache.datawise.backend.database.sql.SqlService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 步骤 6/8：执行只读 SQL。
 * <ul>
 *   <li>首次执行 SAFE_SQL</li>
 *   <li>若列/表错误：在节点内拉 DDL 修正 SQL 并重试一次（不回到 sql_generate 图节点）</li>
 *   <li>仍失败：写入 EXECUTION_OK=false，由路由进入 analysis_failed</li>
 * </ul>
 */
@Component
public class SqlExecuteAnalysisNode {

    private static final Logger log = LoggerFactory.getLogger(SqlExecuteAnalysisNode.class);
    private static final int ANALYSIS_MAX_ROWS = 500;

    private final SqlService sqlService;
    private final SqlExecutionRetrySupport executionRetrySupport;
    private final FederatedSqlExecutionSupport federatedSqlExecutionSupport;
    private final int maxExecuteAttempts;

    public SqlExecuteAnalysisNode(
            SqlService sqlService,
            SqlExecutionRetrySupport executionRetrySupport,
            FederatedSqlExecutionSupport federatedSqlExecutionSupport,
            AiAnalysisProperties analysisProperties
    ) {
        this.sqlService = sqlService;
        this.executionRetrySupport = executionRetrySupport;
        this.federatedSqlExecutionSupport = federatedSqlExecutionSupport;
        this.maxExecuteAttempts = analysisProperties.getRetry().getMaxSqlExecuteAttempts();
    }

    public Map<String, Object> execute(OverAllState state) {
        return AnalysisNodeSupport.runWithUserContext(state, () -> executeInternal(state));
    }

    private Map<String, Object> executeInternal(OverAllState state) {
        AiChatRequest request = AiAnalysisGraphStateCoercion.requireRequest(state);
        AnalysisNodeSupport.ConnectionScope scope = AnalysisNodeSupport.readConnectionScope(state);
        AiEvidenceBundle evidence = AiAnalysisGraphStateCoercion.evidence(state, scope.prompt());
        AiAnalysisPlan plan = AiAnalysisPlanReader.read(state);
        boolean federated = plan != null && plan.federated();

        String currentSql = state.value(AiAnalysisGraphKeys.SAFE_SQL, "");
        SqlExecutionException lastError = null;

        for (int attempt = 1; attempt <= maxExecuteAttempts; attempt++) {
            long stepStart = AnalysisStepRunner.start();
            AnalysisStepRunner.running(AiAnalysisSteps.SQL_EXECUTE, "执行查询");
            try {
                ExecuteSqlResult result = federated
                        ? federatedSqlExecutionSupport.executeFederated(request, currentSql, ANALYSIS_MAX_ROWS)
                        : sqlService.execute(
                        currentSql,
                        scope.connectionId(),
                        scope.database(),
                        ANALYSIS_MAX_ROWS,
                        null
                );
                return buildSuccessUpdates(state, currentSql, result, attempt, stepStart, federated);
            } catch (SqlExecutionException ex) {
                lastError = ex;
                AnalysisStepRunner.failed(AiAnalysisSteps.SQL_EXECUTE, ex);

                if (attempt >= maxExecuteAttempts) {
                    break;
                }

                AiCallLogger.logAnalysisStep(
                        log,
                        "sql-execute-retry",
                        "error",
                        AnalysisStepRunner.messageOf(ex),
                        "attempt",
                        attempt
                );
                currentSql = executionRetrySupport.regenerateValidatedSql(
                        AiAnalysisLlmResolver.resolve(request, AiAnalysisLlmResolver.ROUTE_SQL),
                        scope.prompt(),
                        scope.connectionId(),
                        scope.database(),
                        evidence,
                        request.analysisContext(),
                        currentSql,
                        AnalysisStepRunner.messageOf(ex),
                        ex.getErrorLine()
                );
            }
        }

        return buildFailureUpdates(currentSql, lastError);
    }

    private Map<String, Object> buildSuccessUpdates(
            OverAllState state,
            String sql,
            ExecuteSqlResult result,
            int attempt,
            long stepStart,
            boolean federated
    ) {
        Map<String, Object> execDetail = new LinkedHashMap<>();
        execDetail.put("rowCount", result.rowCount());
        execDetail.put("durationMs", result.durationMs());
        execDetail.put("attempt", attempt);
        execDetail.put("federated", federated);
        AnalysisStepRunner.ok(AiAnalysisSteps.SQL_EXECUTE, "查询完成", stepStart, execDetail);
        AiCallLogger.logAnalysisStep(
                log,
                "sql-executed",
                "rows",
                result.rowCount(),
                "durationMs",
                result.durationMs(),
                "attempt",
                attempt
        );

        Map<String, Object> updates = new LinkedHashMap<>();
        updates.put(AiAnalysisGraphKeys.EXECUTE_RESULT, result);
        updates.put(AiAnalysisGraphKeys.EXECUTION_OK, true);
        updates.put(AiAnalysisGraphKeys.EXECUTION_ERROR, "");
        updates.put(AiAnalysisGraphKeys.SAFE_SQL, sql);
        updates.put(AiAnalysisGraphKeys.SQL, sql);
        return updates;
    }

    private Map<String, Object> buildFailureUpdates(String sql, SqlExecutionException lastError) {
        String message = lastError != null
                ? AnalysisStepRunner.messageOf(lastError)
                : "SQL 执行失败";
        AiCallLogger.logAnalysisStep(log, "sql-execute-failed", "error", message);

        Map<String, Object> updates = new LinkedHashMap<>();
        updates.put(AiAnalysisGraphKeys.EXECUTION_OK, false);
        updates.put(AiAnalysisGraphKeys.EXECUTION_ERROR, message);
        updates.put(AiAnalysisGraphKeys.EXECUTION_FAILED_SQL, sql);
        if (lastError != null && lastError.getErrorLine() != null) {
            updates.put(AiAnalysisGraphKeys.EXECUTION_ERROR_LINE, lastError.getErrorLine());
        }
        return updates;
    }
}
