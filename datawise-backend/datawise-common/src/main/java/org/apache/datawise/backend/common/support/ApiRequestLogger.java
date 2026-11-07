package org.apache.datawise.backend.common.support;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 统一 API 请求日志，便于排查前端是否真正打到后端
 */
public final class ApiRequestLogger {

    private ApiRequestLogger() {
    }

    public static void logEntry(Logger log, String action, Object... keyValues) {
        if (!log.isInfoEnabled()) {
            return;
        }
        StringBuilder message = new StringBuilder(action);
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            message.append(' ').append(keyValues[i]).append('=').append(keyValues[i + 1]);
        }
        log.info("{}", message);
    }

    public static void logSuccess(Logger log, String action, Object... keyValues) {
        logEntry(log, action + " ok", keyValues);
    }

    public static void logFailure(Logger log, String action, Exception ex, Object... keyValues) {
        StringBuilder message = new StringBuilder(action).append(" failed");
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            message.append(' ').append(keyValues[i]).append('=').append(keyValues[i + 1]);
        }
        ExceptionLogging.error(log, message.toString(), ex);
    }
}
