package org.apache.datawise.backend.ai.analysis.graph.state;

/**
 * StateGraph {@link com.alibaba.cloud.ai.graph.OverAllState} 键名
 */
public final class AiAnalysisGraphKeys {

    public static final String REQUEST = "request";
    public static final String USER_ID = "userId";
    public static final String USER_GUEST = "userGuest";
    public static final String SESSION_ID = "sessionId";
    public static final String RUN_ID = "runId";
    public static final String PROMPT = "prompt";
    public static final String CONNECTION_ID = "connectionId";
    public static final String DATABASE = "database";
    public static final String PLAN = "plan";
    public static final String STEP_ROUTE = "stepRoute";
    /**
     * 当次分析禁用的可选步骤（step_route 节点输出）
     */
    public static final String RUN_DISABLED_STEPS = "runDisabledSteps";
    public static final String EVIDENCE = "evidence";
    public static final String SCHEMA = "schema";
    public static final String SQL = "sql";
    public static final String SAFE_SQL = "safeSql";
    public static final String EXECUTE_RESULT = "executeResult";
    public static final String CHART = "chart";
    public static final String CHART_ERROR = "chartError";
    public static final String SUMMARY = "summary";
    public static final String REPORT = "report";
    public static final String REPLY = "reply";

    public static final String PYTHON_CODE = "pythonCode";
    public static final String PYTHON_RESULT = "pythonResult";
    public static final String PYTHON_INSIGHT = "pythonInsight";
    public static final String PYTHON_OK = "pythonOk";
    public static final String PYTHON_ERROR = "pythonError";
    public static final String PYTHON_RETRY_COUNT = "pythonRetryCount";

    public static final String VALIDATION_OK = "validationOk";
    public static final String VALIDATION_ERROR = "validationError";
    public static final String SQL_RETRY_COUNT = "sqlRetryCount";
    public static final String SQL_APPROVED = "sqlApproved";

    public static final String EXECUTION_OK = "executionOk";
    public static final String EXECUTION_ERROR = "executionError";
    public static final String EXECUTION_ERROR_LINE = "executionErrorLine";
    public static final String EXECUTION_FAILED_SQL = "executionFailedSql";

    public static final String ROUTE_VALIDATE_OK = "ok";
    public static final String ROUTE_VALIDATE_RETRY = "retry";
    public static final String ROUTE_VALIDATE_FAILED = "failed";

    public static final String ROUTE_EXECUTE_FAILED = "execute_failed";
    public static final String ROUTE_POST_EXECUTE_PYTHON = "post_execute_python";
    public static final String ROUTE_POST_EXECUTE_CHART = "post_execute_chart";

    public static final String ROUTE_POST_CHART_OK = "post_chart_ok";
    public static final String ROUTE_POST_CHART_FAILED = "post_chart_failed";

    public static final String ROUTE_PYTHON_OK = "python_ok";
    public static final String ROUTE_PYTHON_RETRY = "python_retry";
    public static final String ROUTE_PYTHON_FAILED = "python_failed";

    public static final String STEP_ANALYSIS_FAILED = "analysis_failed";

    private AiAnalysisGraphKeys() {
    }
}
