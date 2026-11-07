package org.apache.datawise.backend.polaris;

import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.Locale;

/** Connection settings for Polaris console / naming API. */
public final class PolarisConnectionConfig {

    private final String baseUrl;
    private final String username;
    private final String password;
    private final String owner;
    private final String staticToken;
    private final boolean https;

    private PolarisConnectionConfig(
            String baseUrl,
            String username,
            String password,
            String owner,
            String staticToken,
            boolean https
    ) {
        this.baseUrl = baseUrl;
        this.username = username;
        this.password = password;
        this.owner = owner;
        this.staticToken = staticToken;
        this.https = https;
    }

    public static PolarisConnectionConfig from(ConnectionEntity entity) {
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

        String username = entity != null && entity.getUsername() != null ? entity.getUsername().trim() : null;
        if (username != null && username.isEmpty()) {
            username = null;
        }
        String password = entity != null ? entity.getPassword() : null;
        if (password != null && password.isBlank()) {
            password = null;
        }

        String owner = readProperty(entity != null ? entity.getAdvancedConfig() : null, "owner", "polaris");
        if (owner == null || owner.isBlank()) {
            owner = "polaris";
        }

        // Static API token: advanced `token=...`, or password-only (no username) for token-auth setups.
        String staticToken = readProperty(entity != null ? entity.getAdvancedConfig() : null, "token", null);
        if ((staticToken == null || staticToken.isBlank()) && username == null && password != null) {
            staticToken = password;
        }
        if (staticToken != null) {
            staticToken = staticToken.trim();
            if (staticToken.isEmpty()) {
                staticToken = null;
            }
        }

        return new PolarisConnectionConfig(baseUrl, username, password, owner.trim(), staticToken, useHttps);
    }

    public String baseUrl() {
        return baseUrl;
    }

    public String username() {
        return username;
    }

    public String password() {
        return password;
    }

    public String owner() {
        return owner;
    }

    public String staticToken() {
        return staticToken;
    }

    public boolean https() {
        return https;
    }

    public boolean hasPasswordLogin() {
        return username != null && !username.isBlank() && password != null && !password.isBlank();
    }

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
                : parsePort(entity != null ? entity.getPort() : null, https ? 443 : 8090);
        String contextPath = extractContextPath(pathAndQuery);
        return new ParsedEndpoint(host, port, https, contextPath);
    }

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
        return path;
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
