package org.apache.datawise.backend.nacos;

import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.Locale;

/** Connection settings for Nacos Open API. */
public final class NacosConnectionConfig {

    private final String baseUrl;
    private final String username;
    private final String password;
    private final boolean https;
    private final boolean v3Api;
    private final String namespace;

    private NacosConnectionConfig(
            String baseUrl,
            String username,
            String password,
            boolean https,
            boolean v3Api,
            String namespace
    ) {
        this.baseUrl = baseUrl;
        this.username = username;
        this.password = password;
        this.https = https;
        this.v3Api = v3Api;
        this.namespace = namespace;
    }

    public static NacosConnectionConfig from(ConnectionEntity entity) {
        ParsedEndpoint endpoint = resolveEndpoint(entity);
        String advanced = entity != null ? entity.getAdvancedConfig() : null;
        boolean useHttps = endpoint.https();
        String explicitHttps = readProperty(advanced, "useHttps", null);
        if (explicitHttps != null) {
            useHttps = "true".equalsIgnoreCase(explicitHttps.trim()) || "1".equals(explicitHttps.trim());
        }
        boolean rnacos = "rnacos".equalsIgnoreCase(readProperty(advanced, "nacosImplementation", "nacos"));
        String versionMode = rnacos ? "auto" : normalizeMode(readProperty(advanced, "nacosVersionMode", "auto"));
        String contextPath = readProperty(advanced, "contextPath", null);
        if (contextPath == null || contextPath.isBlank()) {
            contextPath = endpoint.contextPath();
        }
        if (contextPath == null || contextPath.isBlank()) {
            contextPath = defaultContextPath(rnacos, versionMode, endpoint.port());
        }
        contextPath = normalizeContextPath(contextPath);
        boolean v3Api = resolveV3Api(rnacos, versionMode, endpoint.port(), contextPath);
        String scheme = useHttps ? "https" : "http";
        String baseUrl = scheme + "://" + endpoint.host() + ":" + endpoint.port() + contextPath;
        String username = entity != null && entity.getUsername() != null ? entity.getUsername().trim() : null;
        if (username != null && username.isBlank()) {
            username = null;
        }
        String password = entity != null ? entity.getPassword() : null;
        String namespace = readProperty(advanced, "namespace", null);
        if (namespace != null && namespace.isBlank()) {
            namespace = null;
        }
        return new NacosConnectionConfig(baseUrl, username, password, useHttps, v3Api, namespace);
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

    public boolean https() {
        return https;
    }

    public boolean v3Api() {
        return v3Api;
    }

    public String namespace() {
        return namespace;
    }

    public boolean hasCredentials() {
        return username != null && !username.isBlank();
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
                : parsePort(entity != null ? entity.getPort() : null, https ? 443 : 8848);
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

    static String defaultContextPath(boolean rnacos, String versionMode, int port) {
        if (rnacos || "v2".equals(versionMode)) {
            return "/nacos";
        }
        if ("v3".equals(versionMode) || port == 8080) {
            return "";
        }
        return "/nacos";
    }

    static boolean resolveV3Api(boolean rnacos, String versionMode, int port, String contextPath) {
        if (rnacos || "v2".equals(versionMode)) {
            return false;
        }
        if ("v3".equals(versionMode)) {
            return true;
        }
        String path = contextPath == null ? "" : contextPath.trim();
        if (path.isEmpty() || "/".equals(path)) {
            return port != 8848;
        }
        return false;
    }

    static String normalizeMode(String versionMode) {
        if (versionMode == null || versionMode.isBlank()) {
            return "auto";
        }
        String mode = versionMode.trim().toLowerCase(Locale.ROOT);
        if ("v2".equals(mode) || "v3".equals(mode)) {
            return mode;
        }
        return "auto";
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
