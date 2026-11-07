package org.apache.datawise.backend.server.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;

import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

/**
 * HTTP access log.
 * <p>
 * Console stays scannable: one short line, no repeated request id (that lives in MDC).
 * Fast successful reads are DEBUG so a page load does not flood INFO.
 * Writes, slow calls, and errors stay visible, with a short session id.
 */
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger("datawise.api");
    /** Calls at least this slow are warned even when the status is 2xx. */
    static final long SLOW_MS = 800;
    private static final int MAX_BODY_LOG_CHARS = 2048;
    private static final int MAX_PATH_CHARS = 160;
    private static final Set<String> SENSITIVE_KEYS = Set.of(
            "password",
            "userpassword",
            "passwordhash",
            "sshpassword"
    );

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return isQuietPath(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        ContentCachingRequestWrapper wrapped = new ContentCachingRequestWrapper(request);
        long startedAt = System.currentTimeMillis();
        try {
            filterChain.doFilter(wrapped, response);
        } catch (Exception ex) {
            ExceptionLogging.error(log, "request.failed method=" + request.getMethod()
                    + " path=" + requestPath(request)
                    + " status=" + response.getStatus(), ex);
            throw ex;
        } finally {
            logRequest(wrapped, response, startedAt);
        }
    }

    private void logRequest(
            ContentCachingRequestWrapper request,
            HttpServletResponse response,
            long startedAt
    ) {
        String method = request.getMethod();
        int status = response.getStatus();
        long tookMs = Math.max(0, System.currentTimeMillis() - startedAt);
        AccessSeverity severity = classify(method, status, tookMs);
        if (severity == AccessSeverity.SKIP) {
            return;
        }
        if (severity == AccessSeverity.DEBUG && !log.isDebugEnabled()) {
            return;
        }

        String message = formatAccessLine(
                method,
                requestPath(request),
                status,
                tookMs,
                request.getHeader(SessionAuthFilter.SESSION_HEADER),
                severity
        );
        if (severity == AccessSeverity.DEBUG && log.isDebugEnabled()) {
            String bodyPreview = readBodyPreview(request);
            if (!bodyPreview.isBlank()) {
                message = message + " body=" + bodyPreview;
            }
        }
        switch (severity) {
            case ERROR -> log.error("{}", message);
            case WARN -> log.warn("{}", message);
            case INFO -> log.info("{}", message);
            case DEBUG -> log.debug("{}", message);
            case SKIP -> {
                // already returned
            }
        }
    }

    /** How loud this call should be. Package-visible for tests. */
    static AccessSeverity classify(String method, int status, long tookMs) {
        String normalized = method == null ? "" : method.trim().toUpperCase(Locale.ROOT);
        if ("OPTIONS".equals(normalized)) {
            return AccessSeverity.SKIP;
        }
        if (status >= 500) {
            return AccessSeverity.ERROR;
        }
        if (status >= 400 || tookMs >= SLOW_MS) {
            return AccessSeverity.WARN;
        }
        if ("POST".equals(normalized)
                || "PUT".equals(normalized)
                || "PATCH".equals(normalized)
                || "DELETE".equals(normalized)) {
            return AccessSeverity.INFO;
        }
        return AccessSeverity.DEBUG;
    }

    /** One scannable line. Request id is not repeated; the log pattern already prints it. */
    static String formatAccessLine(
            String method,
            String path,
            int status,
            long tookMs,
            String sessionId,
            AccessSeverity severity
    ) {
        StringBuilder message = new StringBuilder();
        message.append(method == null || method.isBlank() ? "-" : method.trim().toUpperCase(Locale.ROOT));
        message.append(' ');
        message.append(path == null || path.isBlank() ? "/" : truncate(path, MAX_PATH_CHARS));
        message.append(' ').append(status);
        message.append(' ').append(Math.max(0, tookMs)).append("ms");
        if (severity == AccessSeverity.WARN && status < 400 && tookMs >= SLOW_MS) {
            message.append(" slow");
        }
        if (severity != AccessSeverity.DEBUG) {
            String sid = shortSession(sessionId);
            if (sid != null) {
                message.append(" sid=").append(sid);
            }
        }
        return message.toString();
    }

    enum AccessSeverity {
        SKIP,
        DEBUG,
        INFO,
        WARN,
        ERROR
    }

    /** Frontend / ops probes that would otherwise flood INFO logs. */
    static boolean isQuietPath(String uri) {
        if (uri == null || uri.isBlank()) {
            return false;
        }
        String path = uri;
        int query = path.indexOf('?');
        if (query >= 0) {
            path = path.substring(0, query);
        }
        return path.endsWith("/api/health")
                || path.startsWith("/favicon.ico")
                || path.contains("/actuator");
    }

    private static String requestPath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String query = request.getQueryString();
        return query == null || query.isBlank() ? uri : uri + "?" + query;
    }

    private String readBodyPreview(ContentCachingRequestWrapper request) {
        byte[] content = request.getContentAsByteArray();
        if (content.length == 0) {
            return "";
        }
        String contentType = request.getContentType();
        if (contentType == null) {
            return "";
        }
        String normalized = contentType.toLowerCase();
        if (!normalized.contains("json")
                && !normalized.contains("xml")
                && !normalized.contains("text")
                && !normalized.contains("form-urlencoded")) {
            return "[binary " + content.length + " bytes]";
        }

        Charset charset = resolveCharset(request.getCharacterEncoding());
        String body = new String(content, charset);
        body = redactSensitiveJsonFields(body);
        return truncate(body.replaceAll("\\s+", " ").trim(), MAX_BODY_LOG_CHARS);
    }

    private static Charset resolveCharset(String encoding) {
        if (encoding == null || encoding.isBlank()) {
            return StandardCharsets.UTF_8;
        }
        try {
            return Charset.forName(encoding);
        } catch (Exception ex) {
            ExceptionLogging.recoverable(log, "resolveCharset fallback to UTF-8", ex);
            return StandardCharsets.UTF_8;
        }
    }

    private static String redactSensitiveJsonFields(String body) {
        String redacted = body;
        for (String key : SENSITIVE_KEYS) {
            redacted = redacted.replaceAll(
                    "(?i)\"" + key + "\"\\s*:\\s*\"[^\"]*\"",
                    "\"" + key + "\":\"***\""
            );
        }
        return redacted;
    }

    private static String shortSession(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return null;
        }
        String value = sessionId.trim();
        if (value.regionMatches(true, 0, "session-", 0, "session-".length())) {
            value = value.substring("session-".length());
        }
        if (value.length() > 8) {
            value = value.substring(0, 8);
        }
        return value.isBlank() ? null : value;
    }

    private static String truncate(String value, int maxLen) {
        if (value == null) {
            return "";
        }
        if (value.length() <= maxLen) {
            return value;
        }
        return value.substring(0, maxLen) + "...";
    }
}
