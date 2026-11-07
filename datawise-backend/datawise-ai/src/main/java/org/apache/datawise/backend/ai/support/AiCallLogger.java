package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.domain.AiChatReply;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;

/**
 * AI 调用链路日志（不打印 apiKey）
 */
public final class AiCallLogger {

    private static final int PROMPT_PREVIEW_LEN = 120;
    private static final int SQL_PREVIEW_LEN = 200;
    private static final int REPLY_PREVIEW_LEN = 160;

    private AiCallLogger() {
    }

    public static void logChatEntry(Logger log, String prompt, int targetCount, AiLlmProfileDto llm) {
        if (!log.isInfoEnabled()) {
            return;
        }
        log.info(
                "AI chat request provider={} model={} targets={} prompt={}",
                providerLabel(llm),
                modelLabel(llm),
                targetCount,
                preview(prompt, PROMPT_PREVIEW_LEN)
        );
    }

    public static void logRoute(Logger log, String route, String reason) {
        if (!log.isInfoEnabled()) {
            return;
        }
        log.info("AI chat route={} reason={}", route, reason);
    }

    public static void logLlmStart(Logger log, String phase, AiLlmProfileDto llm, int systemLen, int userLen) {
        if (!log.isInfoEnabled()) {
            return;
        }
        log.info(
                "AI LLM start phase={} provider={} model={} baseUrl={} systemChars={} userChars={}",
                phase,
                providerLabel(llm),
                modelLabel(llm),
                baseUrlLabel(llm),
                systemLen,
                userLen
        );
    }

    public static void logLlmSuccess(Logger log, String phase, long durationMs, int replyChars) {
        if (!log.isInfoEnabled()) {
            return;
        }
        log.info("AI LLM ok phase={} durationMs={} replyChars={}", phase, durationMs, replyChars);
    }

    public static void logLlmFailure(Logger log, String phase, long durationMs, Exception ex) {
        ExceptionLogging.warn(log, "ai.llm.failed phase=" + phase + " took=" + durationMs + "ms", ex);
    }

    public static void logAnalysisStep(Logger log, String step, Object... keyValues) {
        if (!log.isInfoEnabled()) {
            return;
        }
        StringBuilder message = new StringBuilder("AI analysis ").append(step);
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            message.append(' ').append(keyValues[i]).append('=').append(keyValues[i + 1]);
        }
        log.info("{}", message);
    }

    public static void logChatSuccess(Logger log, AiChatReply reply, long durationMs) {
        if (!log.isInfoEnabled()) {
            return;
        }
        String mode = reply.mode() != null ? reply.mode() : "chat";
        int rowCount = reply.rows() != null ? reply.rows().size() : 0;
        log.info(
                "AI chat ok mode={} durationMs={} replyChars={} sqlChars={} rows={} chart={}",
                mode,
                durationMs,
                reply.reply() != null ? reply.reply().length() : 0,
                reply.sql() != null ? reply.sql().length() : 0,
                rowCount,
                reply.chart() != null ? reply.chart().type() : "none"
        );
        if (log.isDebugEnabled()) {
            log.debug(
                    "AI chat replyPreview={} sqlPreview={}",
                    preview(reply.reply(), REPLY_PREVIEW_LEN),
                    preview(reply.sql(), SQL_PREVIEW_LEN)
            );
        }
    }

    public static void logChatFailure(Logger log, long durationMs, Exception ex) {
        ExceptionLogging.error(log, "ai.chat.failed took=" + durationMs + "ms", ex);
    }

    public static void logSqlGenerateEntry(Logger log, String prompt, String connectionId, String database, AiLlmProfileDto llm) {
        if (!log.isInfoEnabled()) {
            return;
        }
        log.info(
                "AI sql/generate provider={} model={} connectionId={} database={} prompt={}",
                providerLabel(llm),
                modelLabel(llm),
                connectionId,
                database,
                preview(prompt, PROMPT_PREVIEW_LEN)
        );
    }

    public static void logSqlGenerateSuccess(Logger log, String sql, long durationMs) {
        if (!log.isInfoEnabled()) {
            return;
        }
        log.info("AI sql/generate ok durationMs={} sqlChars={}", durationMs, sql != null ? sql.length() : 0);
        if (log.isDebugEnabled()) {
            log.debug("AI sql/generate sqlPreview={}", preview(sql, SQL_PREVIEW_LEN));
        }
    }

    private static String providerLabel(AiLlmProfileDto llm) {
        if (llm == null || llm.provider() == null || llm.provider().isBlank()) {
            return "mock";
        }
        return llm.provider();
    }

    private static String modelLabel(AiLlmProfileDto llm) {
        return llm != null && llm.model() != null ? llm.model() : "-";
    }

    private static String baseUrlLabel(AiLlmProfileDto llm) {
        return llm != null && llm.baseUrl() != null ? llm.baseUrl() : "-";
    }

    private static String preview(String text, int maxLen) {
        if (text == null) {
            return "";
        }
        String normalized = text.replace('\n', ' ').replace('\r', ' ').trim();
        if (normalized.length() <= maxLen) {
            return normalized;
        }
        return normalized.substring(0, maxLen) + "...";
    }
}
