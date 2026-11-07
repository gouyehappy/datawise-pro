package org.apache.datawise.backend.ai.analysis;

import org.apache.datawise.backend.ai.AiException;
import org.apache.datawise.backend.common.UnauthorizedException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 将分析链路异常映射为前端可消费的 SSE error 载荷
 */
public final class AiAnalysisErrorMapper {

    public record ErrorPayload(String code, String message) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("code", code);
            map.put("message", message);
            return map;
        }
    }

    private AiAnalysisErrorMapper() {
    }

    public static ErrorPayload map(Throwable error) {
        if (error instanceof AiException aiEx) {
            return new ErrorPayload(aiEx.code(), userMessage(aiEx));
        }
        if (isUnauthorized(error)) {
            return sessionExpiredPayload();
        }
        String message = rootMessage(error);
        String code = inferCode(message);
        return new ErrorPayload(code, message);
    }

    public static String userMessage(Throwable error) {
        if (error instanceof AiException aiEx) {
            return nonBlank(aiEx.getMessage(), "数据分析失败");
        }
        return nonBlank(rootMessage(error), "数据分析失败");
    }

    private static String inferCode(String message) {
        if (message != null && message.contains("分析会话已过期")) {
            return AiAnalysisErrorCodes.SESSION_EXPIRED;
        }
        if (message != null && message.contains("登录会话已失效")) {
            return AiAnalysisErrorCodes.SESSION_EXPIRED;
        }
        if (isUnauthorizedMessage(message)) {
            return AiAnalysisErrorCodes.SESSION_EXPIRED;
        }
        if (message != null && message.contains("SQL 生成失败")) {
            return AiAnalysisErrorCodes.SQL_GENERATE_FAILED;
        }
        if (message != null && message.contains("摘要生成失败")) {
            return AiAnalysisErrorCodes.SUMMARY_FAILED;
        }
        if (message != null && message.contains("恢复失败")) {
            return AiAnalysisErrorCodes.GRAPH_RESUME_FAILED;
        }
        if (message != null && message.contains("执行失败")) {
            return AiAnalysisErrorCodes.GRAPH_INVOKE_FAILED;
        }
        return AiAnalysisErrorCodes.UNKNOWN;
    }

    private static boolean isUnauthorized(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof UnauthorizedException) {
                return true;
            }
            current = current.getCause();
        }
        return isUnauthorizedMessage(rootMessage(error));
    }

    private static boolean isUnauthorizedMessage(String message) {
        return UnauthorizedException.CODE.equals(message);
    }

    private static ErrorPayload sessionExpiredPayload() {
        return new ErrorPayload(
                AiAnalysisErrorCodes.SESSION_EXPIRED,
                "登录会话已失效，请重新登录后再试"
        );
    }

    private static String rootMessage(Throwable error) {
        if (error == null) {
            return "未知错误";
        }
        Throwable root = error;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        return nonBlank(root.getMessage(), root.getClass().getSimpleName());
    }

    private static String nonBlank(String value, String fallback) {
        return value != null && !value.isBlank() ? value.trim() : fallback;
    }
}
