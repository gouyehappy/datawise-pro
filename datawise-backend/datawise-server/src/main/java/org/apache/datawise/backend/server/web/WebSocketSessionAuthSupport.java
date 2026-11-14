package org.apache.datawise.backend.server.web;

import io.micrometer.core.instrument.Metrics;
import org.apache.datawise.backend.common.support.DatawiseMetricsCatalog;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Resolves browser WebSocket auth: prefer {@code Sec-WebSocket-Protocol} (session id token).
 * Query {@code ?dwSession=} remains as a deprecated compatibility fallback; usage is logged and
 * counted ({@link DatawiseMetricsCatalog#WS_QUERY_SESSION_AUTH}).
 * <p>
 * Does <strong>not</strong> write {@code Sec-WebSocket-Protocol} on the response — echoing the
 * selected sub-protocol is solely {@link SessionAwareHandshakeHandler}'s job. Writing it here
 * as well produced a duplicated header value ({@code session-x, session-x}) that browsers reject
 * after a 101 upgrade (no {@code open} event).
 */
public final class WebSocketSessionAuthSupport {

    public static final String QUERY_SESSION = "dwSession";
    private static final String SEC_WEBSOCKET_PROTOCOL = "Sec-WebSocket-Protocol";
    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(WebSocketSessionAuthSupport.class);

    private WebSocketSessionAuthSupport() {
    }

    /**
     * @param response kept for call-site compatibility; sub-protocol echo is handled by
     *                 {@link SessionAwareHandshakeHandler}, not here
     */
    public static String resolveSessionId(ServerHttpRequest request, ServerHttpResponse response) {
        String fromProtocol = resolveFromSecWebSocketProtocol(request);
        if (fromProtocol != null && !fromProtocol.isBlank()) {
            return fromProtocol;
        }
        String fromQuery = queryParam(request, QUERY_SESSION);
        if (fromQuery != null && !fromQuery.isBlank()) {
            log.warn(
                    "Deprecated WebSocket auth via ?{}= — prefer Sec-WebSocket-Protocol (path={})",
                    QUERY_SESSION,
                    request.getURI().getPath()
            );
            Metrics.counter(DatawiseMetricsCatalog.WS_QUERY_SESSION_AUTH).increment();
        }
        return fromQuery;
    }

    public static String queryParam(ServerHttpRequest request, String name) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            return null;
        }
        String query = servletRequest.getServletRequest().getQueryString();
        if (query == null || query.isBlank()) {
            return null;
        }
        for (String part : query.split("&")) {
            String[] kv = part.split("=", 2);
            if (kv.length == 2 && name.equals(kv[0])) {
                return URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static String resolveFromSecWebSocketProtocol(ServerHttpRequest request) {
        List<String> values = request.getHeaders().get(SEC_WEBSOCKET_PROTOCOL);
        if (values == null || values.isEmpty()) {
            return null;
        }
        for (String header : values) {
            if (header == null || header.isBlank()) {
                continue;
            }
            for (String raw : header.split(",")) {
                String token = raw.trim();
                if (token.startsWith("session-") && token.length() > "session-".length()) {
                    return token;
                }
            }
        }
        return null;
    }
}
