package org.apache.datawise.backend.jenkins;

import org.apache.datawise.backend.model.ConnectionEntity;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;
import java.util.Set;

/** Connection settings for Jenkins REST API. */
public final class JenkinsConnectionConfig {

    private static final Set<String> UI_PATH_SUFFIXES = Set.of(
            "login", "logout", "signup", "securityRealm", "asynchPeople", "manage", "configure"
    );

    private final String baseUrl;
    private final String authorizationHeader;
    private final boolean https;

    private JenkinsConnectionConfig(String baseUrl, String authorizationHeader, boolean https) {
        this.baseUrl = baseUrl;
        this.authorizationHeader = authorizationHeader;
        this.https = https;
    }

    public static JenkinsConnectionConfig from(ConnectionEntity entity) {
        ParsedEndpoint endpoint = resolveEndpoint(entity);
        boolean useHttps = endpoint.https();
        if (entity != null && entity.getAdvancedConfig() != null) {
            String explicit = readProperty(entity.getAdvancedConfig(), "useHttps", null);
            if (explicit != null) {
                useHttps = "true".equalsIgnoreCase(explicit.trim()) || "1".equals(explicit.trim());
            }
        }
        String contextPath = readProperty(entity != null ? entity.getAdvancedConfig() : null, "contextPath", null);
        if (contextPath == null || contextPath.isBlank()) {
            contextPath = endpoint.contextPath();
        }
        contextPath = normalizeContextPath(contextPath);
        String scheme = useHttps ? "https" : "http";
        String baseUrl = scheme + "://" + endpoint.host() + ":" + endpoint.port() + contextPath;
        return new JenkinsConnectionConfig(baseUrl, basicAuthHeader(entity), useHttps);
    }

    public String baseUrl() {
        return baseUrl;
    }

    public String authorizationHeader() {
        return authorizationHeader;
    }

    public boolean https() {
        return https;
    }

    /**
     * Accept host, {@code http(s)://host:port}, or a full Jenkins UI URL such as
     * {@code http://192.0.2.30:8082/jenkins/login?from=%2Fjenkins%2F}.
     */
    static ParsedEndpoint resolveEndpoint(ConnectionEntity entity) {
        String raw = entity != null && entity.getHost() != null && !entity.getHost().isBlank()
                ? entity.getHost().trim()
                : "localhost";
        boolean https = false;
        String remainder = raw;
        String lower = raw.toLowerCase(Locale.ROOT);
        if (lower.startsWith("https://")) {
            https = true;
            remainder = raw.substring("https://".length());
        } else if (lower.startsWith("http://")) {
            https = false;
            remainder = raw.substring("http://".length());
        }

        String pathAndQuery = "";
        int slash = remainder.indexOf('/');
        String hostPort = remainder;
        if (slash >= 0) {
            hostPort = remainder.substring(0, slash);
            pathAndQuery = remainder.substring(slash);
        }

        String host = hostPort;
        Integer embeddedPort = null;
        int colon = hostPort.lastIndexOf(':');
        if (colon > 0 && hostPort.indexOf(']') < 0) {
            String maybePort = hostPort.substring(colon + 1);
            if (maybePort.chars().allMatch(Character::isDigit)) {
                embeddedPort = parsePort(maybePort, -1);
                if (embeddedPort > 0) {
                    host = hostPort.substring(0, colon);
                } else {
                    embeddedPort = null;
                }
            }
        } else if (hostPort.startsWith("[") && hostPort.contains("]:")) {
            int end = hostPort.indexOf("]:");
            String maybePort = hostPort.substring(end + 2);
            if (maybePort.chars().allMatch(Character::isDigit)) {
                embeddedPort = parsePort(maybePort, -1);
                if (embeddedPort > 0) {
                    host = hostPort.substring(1, end);
                } else {
                    embeddedPort = null;
                }
            }
        }
        if (host.isBlank()) {
            host = "localhost";
        }
        int port = embeddedPort != null
                ? embeddedPort
                : parsePort(entity != null ? entity.getPort() : null, https ? 443 : 8080);
        String contextPath = extractContextPath(pathAndQuery);
        return new ParsedEndpoint(host, port, https, contextPath);
    }

    /**
     * From {@code /jenkins/login?from=...} → {@code /jenkins}.
     * Root UI paths like {@code /login} yield empty context path.
     */
    static String extractContextPath(String pathAndQuery) {
        if (pathAndQuery == null || pathAndQuery.isBlank()) {
            return "";
        }
        String path = pathAndQuery.trim();
        int query = path.indexOf('?');
        if (query >= 0) {
            path = path.substring(0, query);
        }
        int hash = path.indexOf('#');
        if (hash >= 0) {
            path = path.substring(0, hash);
        }
        while (path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        if (path.isEmpty() || "/".equals(path)) {
            return "";
        }
        String[] segments = path.split("/");
        // path like /jenkins/login → ["", "jenkins", "login"]
        if (segments.length >= 3) {
            String last = segments[segments.length - 1];
            if (UI_PATH_SUFFIXES.contains(last.toLowerCase(Locale.ROOT)) || last.equalsIgnoreCase("api")) {
                StringBuilder ctx = new StringBuilder();
                for (int i = 1; i < segments.length - 1; i++) {
                    if (segments[i].isBlank()) {
                        continue;
                    }
                    ctx.append('/').append(segments[i]);
                }
                return ctx.toString();
            }
        }
        // /jenkins or /jenkins/job/foo → keep first segment as context when it is a single root app path
        if (segments.length >= 2 && !segments[1].isBlank()) {
            String first = segments[1];
            if (!UI_PATH_SUFFIXES.contains(first.toLowerCase(Locale.ROOT)) && !"api".equalsIgnoreCase(first)) {
                // Prefer first path segment as Jenkins context root (common: /jenkins)
                return "/" + first;
            }
        }
        return "";
    }

    static String normalizeContextPath(String contextPath) {
        if (contextPath == null) {
            return "";
        }
        String value = contextPath.trim();
        if (value.isEmpty()) {
            return "";
        }
        if (!value.startsWith("/")) {
            value = "/" + value;
        }
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private static String basicAuthHeader(ConnectionEntity entity) {
        if (entity == null) {
            return null;
        }
        String username = entity.getUsername();
        String password = entity.getPassword();
        if (username == null || username.isBlank()) {
            return null;
        }
        String token = username.trim() + ":" + (password != null ? password : "");
        return "Basic " + Base64.getEncoder().encodeToString(token.getBytes(StandardCharsets.UTF_8));
    }

    static int parsePort(String port, int defaultPort) {
        if (port == null || port.isBlank()) {
            return defaultPort;
        }
        try {
            return Integer.parseInt(port.trim());
        } catch (NumberFormatException ex) {
            return defaultPort;
        }
    }

    static String readProperty(String advancedConfig, String key, String defaultValue) {
        if (advancedConfig == null || advancedConfig.isBlank() || key == null || key.isBlank()) {
            return defaultValue;
        }
        String prefix = key.toLowerCase(Locale.ROOT) + "=";
        for (String line : advancedConfig.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }
            if (trimmed.toLowerCase(Locale.ROOT).startsWith(prefix)) {
                String value = trimmed.substring(trimmed.indexOf('=') + 1).trim();
                return value.isEmpty() ? defaultValue : value;
            }
        }
        return defaultValue;
    }

    record ParsedEndpoint(String host, int port, boolean https, String contextPath) {
    }
}
