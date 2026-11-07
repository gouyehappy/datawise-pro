package org.apache.datawise.backend.ai.analysis;

/**
 * AI 分析流水线错误码（SSE error 事件与日志对齐）
 */
public final class AiAnalysisErrorCodes {

    public static final String GRAPH_INVOKE_FAILED = "AI_GRAPH_INVOKE_FAILED";
    public static final String GRAPH_RESUME_FAILED = "AI_GRAPH_RESUME_FAILED";
    public static final String SESSION_EXPIRED = "AI_SESSION_EXPIRED";
    public static final String STREAM_FAILED = "AI_STREAM_FAILED";
    public static final String SQL_GENERATE_FAILED = "AI_SQL_GENERATE_FAILED";
    public static final String SUMMARY_FAILED = "AI_SUMMARY_FAILED";
    public static final String RESUME_STILL_INTERRUPTED = "AI_RESUME_STILL_INTERRUPTED";
    public static final String UNKNOWN = "AI_UNKNOWN";

    private AiAnalysisErrorCodes() {
    }
}
