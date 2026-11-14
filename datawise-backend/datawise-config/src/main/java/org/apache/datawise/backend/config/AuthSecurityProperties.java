package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * HTTP 鉴权边界：受保护路由默认拒绝匿名；公开前缀可配置。
 */
@ConfigurationProperties(prefix = "datawise.security.auth")
public class AuthSecurityProperties {

    /**
     * When true, requests without a valid session or API token receive 401
     * unless the path matches {@link #publicPathPrefixes}.
     */
    private boolean requireAuthentication = true;

    /**
     * Bootstrap defaults only — no Swagger / Prometheus (add those in local {@code application.yml}
     * if needed; cloud profile must not expose them anonymously).
     * Do <strong>not</strong> use a blanket {@code /api/auth/} prefix — session, password, and OIDC
     * admin APIs must stay authenticated.
     */
    private List<String> publicPathPrefixes = new ArrayList<>(List.of(
            "/login",
            "/signOut",
            "/api/auth/register",
            "/api/auth/login-options",
            "/api/auth/oidc/login",
            "/api/auth/oidc/callback",
            "/api/health",
            "/actuator/health",
            "/api/public/shares",
            // Browser WS: Sec-WebSocket-Protocol (preferred) or legacy ?dwSession=
            "/ws/ssh-shell",
            "/ws/k8s-exec",
            "/ws/terminal",
            "/ws/community-plugin-stream"));

    /**
     * When non-empty, the HTTP {@code Host} header (hostname only, port stripped) must match
     * one of these values (case-insensitive). Empty = do not enforce (cloud / LAN servers).
     * Desktop profile should list {@code localhost}, {@code 127.0.0.1}, {@code ::1} to block DNS rebinding.
     */
    private List<String> allowedHosts = new ArrayList<>();

    /**
     * Spring CORS {@code allowedOriginPatterns}. Desktop/dev keep loopback + {@code app://};
     * cloud profile should set empty (same-origin only) or an explicit SaaS frontend list.
     */
    private List<String> allowedOriginPatterns = new ArrayList<>(List.of(
            "http://localhost:*",
            "http://127.0.0.1:*",
            "https://localhost:*",
            "https://127.0.0.1:*",
            "app://local",
            "app://*"));

    public boolean isRequireAuthentication() {
        return requireAuthentication;
    }

    public void setRequireAuthentication(boolean requireAuthentication) {
        this.requireAuthentication = requireAuthentication;
    }

    public List<String> getPublicPathPrefixes() {
        return publicPathPrefixes;
    }

    public void setPublicPathPrefixes(List<String> publicPathPrefixes) {
        this.publicPathPrefixes = publicPathPrefixes != null ? publicPathPrefixes : new ArrayList<>();
    }

    public List<String> getAllowedHosts() {
        return allowedHosts;
    }

    public void setAllowedHosts(List<String> allowedHosts) {
        this.allowedHosts = allowedHosts != null ? allowedHosts : new ArrayList<>();
    }

    public List<String> getAllowedOriginPatterns() {
        return allowedOriginPatterns;
    }

    public void setAllowedOriginPatterns(List<String> allowedOriginPatterns) {
        this.allowedOriginPatterns = allowedOriginPatterns != null
                ? new ArrayList<>(allowedOriginPatterns)
                : new ArrayList<>();
    }

    /** {@code true} when Host enforcement is configured. */
    public boolean isHostEnforcementEnabled() {
        return allowedHosts != null && !allowedHosts.isEmpty();
    }

    /**
     * @param hostHeader raw {@code Host} header (may include port or brackets for IPv6)
     */
    public boolean isAllowedHost(String hostHeader) {
        if (!isHostEnforcementEnabled()) {
            return true;
        }
        String hostname = normalizeHostname(hostHeader);
        if (hostname == null || hostname.isBlank()) {
            return false;
        }
        for (String allowed : allowedHosts) {
            if (allowed == null || allowed.isBlank()) {
                continue;
            }
            if (hostname.equals(normalizeHostname(allowed.trim()))) {
                return true;
            }
        }
        return false;
    }

    static String normalizeHostname(String hostHeader) {
        if (hostHeader == null || hostHeader.isBlank()) {
            return null;
        }
        String host = hostHeader.trim().toLowerCase(Locale.ROOT);
        if (host.startsWith("[") && host.contains("]")) {
            int end = host.indexOf(']');
            return host.substring(1, end);
        }
        int colon = host.lastIndexOf(':');
        if (colon > 0 && host.indexOf(':') == colon) {
            // IPv4 or hostname with port — not bare IPv6
            return host.substring(0, colon);
        }
        return host;
    }

    public boolean isPublicPath(String requestUri) {
        if (requestUri == null || requestUri.isBlank()) {
            return false;
        }
        String path = requestUri;
        int query = path.indexOf('?');
        if (query >= 0) {
            path = path.substring(0, query);
        }
        for (String prefix : publicPathPrefixes) {
            if (prefix == null || prefix.isBlank()) {
                continue;
            }
            if (matchesPublicPrefix(path, prefix.trim())) {
                return true;
            }
        }
        // Same-origin SPA (packaged desktop / optional web hosting): HTML, assets, and
        // Vue history routes must load anonymously. Auth only gates backend surfaces.
        return !isBackendSurfacePath(path);
    }

    /**
     * API / WebSocket / Actuator / OpenAPI namespaces that require authentication unless listed
     * in {@link #publicPathPrefixes}. Springdoc paths are not under {@code /api}, so they must be
     * gated here or they would be treated as anonymous SPA routes.
     */
    static boolean isBackendSurfacePath(String path) {
        return pathEqualsOrUnder(path, "/api")
                || pathEqualsOrUnder(path, "/ws")
                || pathEqualsOrUnder(path, "/actuator")
                || pathEqualsOrUnder(path, "/v3/api-docs")
                || pathEqualsOrUnder(path, "/swagger-ui")
                || path.equals("/swagger-ui.html");
    }

    private static boolean pathEqualsOrUnder(String path, String root) {
        if (path.equals(root)) {
            return true;
        }
        return path.startsWith(root + "/");
    }

    /**
     * Exact match, or a boundary-safe prefix ({@code /login} → {@code /login/guest},
     * {@code /swagger-ui} → {@code /swagger-ui.html}), without matching
     * {@code /api/healthz} for prefix {@code /api/health}.
     */
    static boolean matchesPublicPrefix(String path, String prefix) {
        if (path.equals(prefix)) {
            return true;
        }
        if (!path.startsWith(prefix)) {
            return false;
        }
        if (path.length() == prefix.length()) {
            return true;
        }
        char next = path.charAt(prefix.length());
        return next == '/' || next == '.' || next == '-';
    }
}
