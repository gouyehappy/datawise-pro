package org.apache.datawise.backend.common.support;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Unified exception logging for client troubleshooting.
 *
 * <p>Both the caller's business logger and {@code datawise.exception} receive the
 * full throwable (stack + cause chain) so console and file logs show where it failed.</p>
 */
public final class ExceptionLogging {

    private static final Logger EXCEPTION = LoggerFactory.getLogger("datawise.exception");
    private static final int MAX_ERROR_MESSAGE_CHARS = 800;

    private ExceptionLogging() {
    }

    public static void warn(Logger log, String context, Throwable ex) {
        if (ex == null) {
            return;
        }
        String errorType = errorType(ex);
        String errorMessage = errorMessage(ex);
        String at = stackLocation(ex);
        // Pass throwable as last arg so SLF4J/Logback always print the full stack.
        log.warn("{} | level=warn | errorType={} | error={} | at={}", context, errorType, errorMessage, at, ex);
        EXCEPTION.warn(
                "{} | source={} | level=warn | errorType={} | error={} | at={}",
                context,
                sourceName(log),
                errorType,
                errorMessage,
                at,
                ex);
    }

    public static void error(Logger log, String context, Throwable ex) {
        if (ex == null) {
            return;
        }
        String errorType = errorType(ex);
        String errorMessage = errorMessage(ex);
        String at = stackLocation(ex);
        // Pass throwable as last arg so SLF4J/Logback always print the full stack.
        log.error("{} | level=error | errorType={} | error={} | at={}", context, errorType, errorMessage, at, ex);
        EXCEPTION.error(
                "{} | source={} | level=error | errorType={} | error={} | at={}",
                context,
                sourceName(log),
                errorType,
                errorMessage,
                at,
                ex);
    }

    /** Recoverable exception; callers can continue after logging it. */
    public static void recoverable(Logger log, String context, Throwable ex) {
        warn(log, context, ex);
    }

    private static String errorType(Throwable ex) {
        return ex.getClass().getSimpleName();
    }

    private static String errorMessage(Throwable ex) {
        String message = ex.getMessage();
        if (message == null || message.isBlank()) {
            return errorType(ex);
        }
        return truncate(message.replaceAll("\\s+", " ").trim(), MAX_ERROR_MESSAGE_CHARS);
    }

    private static String sourceName(Logger log) {
        String name = log.getName();
        int lastDot = name.lastIndexOf('.');
        if (lastDot < 0 || lastDot == name.length() - 1) {
            return name;
        }
        return name.substring(lastDot + 1);
    }

    private static String truncate(String value, int maxLen) {
        if (value.length() <= maxLen) {
            return value;
        }
        return value.substring(0, maxLen) + "...";
    }

    private static String stackLocation(Throwable ex) {
        StackTraceElement[] frames = ex.getStackTrace();
        if (frames == null) {
            return "unknown";
        }
        for (StackTraceElement frame : frames) {
            if (frame == null || shouldSkipStackFrame(frame.getClassName())) {
                continue;
            }
            return shortenClassName(frame.getClassName())
                    + "." + frame.getMethodName()
                    + ":" + frame.getLineNumber();
        }
        return "unknown";
    }

    private static boolean shouldSkipStackFrame(String className) {
        if (className == null || className.isBlank()) {
            return true;
        }
        return className.startsWith("java.")
                || className.startsWith("javax.")
                || className.startsWith("jakarta.")
                || className.startsWith("jdk.")
                || className.startsWith("sun.")
                || className.startsWith("org.springframework.")
                || className.contains("ExceptionLogging")
                || className.contains("GlobalExceptionHandler");
    }

    private static String shortenClassName(String className) {
        String prefix = "org.apache.datawise.";
        if (className.startsWith(prefix)) {
            return className.substring(prefix.length());
        }
        return className;
    }
}
