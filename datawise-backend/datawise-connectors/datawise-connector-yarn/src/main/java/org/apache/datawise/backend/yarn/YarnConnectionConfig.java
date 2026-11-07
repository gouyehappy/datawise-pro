package org.apache.datawise.backend.yarn;

import org.apache.datawise.backend.model.ConnectionEntity;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;

/** Connection settings for YARN Resource Manager REST API. */
public final class YarnConnectionConfig {

    private static final String DEFAULT_REST_PATH = "/ws/v1/cluster";

    private final String baseUrl;
    private final String authorizationHeader;

    private YarnConnectionConfig(String baseUrl, String authorizationHeader) {
        this.baseUrl = baseUrl;
        this.authorizationHeader = authorizationHeader;
    }

    public static YarnConnectionConfig from(ConnectionEntity entity) {
        ParsedEndpoint endpoint = resolveEndpoint(entity);
        boolean useHttps = endpoint.https();
        String explicitHttps = readProperty(entity != null ? entity.getAdvancedConfig() : null, "useHttps", null);
        if (explicitHttps != null) {
            useHttps = "true".equalsIgnoreCase(explicitHttps.trim()) || "1".equals(explicitHttps.trim());
        }
        String restPath = readProperty(entity != null ? entity.getAdvancedConfig() : null, "restPath", null);
        if (restPath == null || restPath.isBlank()) {
            restPath = endpoint.restPath();
        }
        if (restPath == null || restPath.isBlank()) {
            restPath = DEFAULT_REST_PATH;
        }
        if (!restPath.startsWith("/")) {
            restPath = "/" + restPath;
        }
        while (restPath.endsWith("/")) {
            restPath = restPath.substring(0, restPath.length() - 1);
        }
        String scheme = useHttps ? "https" : "http";
        String baseUrl = scheme + "://" + endpoint.host() + ":" + endpoint.port() + restPath;
        return new YarnConnectionConfig(baseUrl, basicAuthHeader(entity));
    }

    public String baseUrl() {
        return baseUrl;
    }

    public String authorizationHeader() {
        return authorizationHeader;
    }

    /**
     * Accept host, {@code http(s)://host:port}, or RM UI URLs such as
     * {@code http://rm:8088/cluster} / {@code http://rm:8088/ws/v1/cluster}.
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
                : parsePort(entity != null ? entity.getPort() : null, https ? 443 : 8088);
        return new ParsedEndpoint(host, port, https, extractRestPath(pathAndQuery));
    }

    static String extractRestPath(String pathAndQuery) {
        if (pathAndQuery == null || pathAndQuery.isBlank()) {
            return DEFAULT_REST_PATH;
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
        String lower = path.toLowerCase(Locale.ROOT);
        int rest = lower.indexOf("/ws/v1/cluster");
        if (rest >= 0) {
            return path.substring(0, rest + "/ws/v1/cluster".length());
        }
        if (lower.equals("/cluster")
                || lower.startsWith("/cluster/")
                || lower.endsWith("/cluster")
                || lower.contains("/cluster/apps")
                || lower.contains("/cluster/nodes")
                || lower.contains("/cluster/scheduler")) {
            return DEFAULT_REST_PATH;
        }
        if (path.isEmpty() || "/".equals(path)) {
            return DEFAULT_REST_PATH;
        }
        return path;
    }

    private static String basicAuthHeader(ConnectionEntity entity) {
        if (entity == null) {
            return null;
        }
        String username = entity.getUsername();
        String password = entity.getPassword();
        if (username == null || username.isBlank() || password == null) {
            return null;
        }
        String token = username + ":" + password;
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

    record ParsedEndpoint(String host, int port, boolean https, String restPath) {
    }
}
