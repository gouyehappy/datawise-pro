package org.apache.datawise.backend.elasticsearch;

import org.apache.datawise.backend.model.ConnectionEntity;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;

/**
 * Elasticsearch HTTP endpoint settings derived from {@link ConnectionEntity}.
 * Extra knobs live in {@code advancedConfig} as {@code key=value} lines.
 */
public final class ElasticsearchConnectionConfig {

    public enum TransportMode {
        DIRECT,
        KIBANA_PROXY
    }

    private static final int DEFAULT_PORT = 9200;
    private static final int DEFAULT_KIBANA_PORT = 5601;

    private final String clusterBaseUrl;
    private final String authorizationHeader;
    private final TransportMode transportMode;
    private final String kibanaBasePath;
    private final String connectivityCheckPath;
    private final boolean connectivityCheckDisabled;
    private final boolean insecureSkipTlsVerify;

    private ElasticsearchConnectionConfig(
            String clusterBaseUrl,
            String authorizationHeader,
            TransportMode transportMode,
            String kibanaBasePath,
            String connectivityCheckPath,
            boolean connectivityCheckDisabled,
            boolean insecureSkipTlsVerify
    ) {
        this.clusterBaseUrl = clusterBaseUrl;
        this.authorizationHeader = authorizationHeader;
        this.transportMode = transportMode;
        this.kibanaBasePath = kibanaBasePath;
        this.connectivityCheckPath = connectivityCheckPath;
        this.connectivityCheckDisabled = connectivityCheckDisabled;
        this.insecureSkipTlsVerify = insecureSkipTlsVerify;
    }

    public static ElasticsearchConnectionConfig from(ConnectionEntity entity) {
        String advanced = entity != null ? entity.getAdvancedConfig() : null;
        boolean useHttps = booleanProperty(advanced, "useHttps", false);
        ParsedHost host = resolveHost(entity, useHttps);
        useHttps = host.https() || useHttps;

        TransportMode mode = kibanaProxyEnabled(advanced) ? TransportMode.KIBANA_PROXY : TransportMode.DIRECT;
        int defaultPort = mode == TransportMode.KIBANA_PROXY ? DEFAULT_KIBANA_PORT : DEFAULT_PORT;
        int port = host.port() > 0 ? host.port() : parsePort(entity != null ? entity.getPort() : null, defaultPort);

        String scheme = useHttps ? "https" : "http";
        String clusterBaseUrl = scheme + "://" + host.host() + ":" + port;

        String kibanaBasePath = normalizeKibanaBasePath(readProperty(advanced, "kibanaBasePath", ""));
        String connectivityCheckPath = normalizeConnectivityCheckPath(
                readProperty(advanced, "connectivityCheckPath", "")
        );
        boolean connectivityCheckDisabled = booleanProperty(advanced, "connectivityCheckDisabled", false);
        boolean insecureSkipTlsVerify = booleanProperty(advanced, "insecureSkipTlsVerify", false);

        return new ElasticsearchConnectionConfig(
                clusterBaseUrl,
                basicAuthHeader(entity),
                mode,
                kibanaBasePath,
                connectivityCheckPath,
                connectivityCheckDisabled,
                insecureSkipTlsVerify
        );
    }

    /** Base URL of the ES cluster or Kibana host (no trailing slash). */
    public String clusterBaseUrl() {
        return clusterBaseUrl;
    }

    public String authorizationHeader() {
        return authorizationHeader;
    }

    public TransportMode transportMode() {
        return transportMode;
    }

    /** Normalized Kibana base path such as {@code /kibana}, or empty. */
    public String kibanaBasePath() {
        return kibanaBasePath;
    }

    /**
     * Relative path used for connect/test (default {@code /}). Empty means {@code /}.
     */
    public String connectivityCheckPath() {
        return connectivityCheckPath == null || connectivityCheckPath.isBlank() ? "/" : connectivityCheckPath;
    }

    public boolean connectivityCheckDisabled() {
        return connectivityCheckDisabled;
    }

    public boolean insecureSkipTlsVerify() {
        return insecureSkipTlsVerify;
    }

    public String describeTarget() {
        if (transportMode == TransportMode.KIBANA_PROXY) {
            return clusterBaseUrl + kibanaBasePath + " (Kibana proxy)";
        }
        return clusterBaseUrl;
    }

    static boolean kibanaProxyEnabled(String advancedConfig) {
        String mode = readProperty(advancedConfig, "mode", null);
        if (mode != null && "kibana".equalsIgnoreCase(mode.trim())) {
            return true;
        }
        return booleanProperty(advancedConfig, "kibanaProxyEnabled", false);
    }

    static String normalizeKibanaBasePath(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String path = value.trim().replaceAll("^/+|/+$", "");
        return path.isEmpty() ? "" : "/" + path;
    }

    static String normalizeConnectivityCheckPath(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String line = value.trim().split("\\R", 2)[0].trim();
        line = line.replaceFirst("(?i)^GET\\s+", "").trim();
        if (line.isEmpty() || "/".equals(line)) {
            return "";
        }
        return line.startsWith("/") ? line : "/" + line;
    }

    private static ParsedHost resolveHost(ConnectionEntity entity, boolean defaultHttps) {
        String raw = entity != null && entity.getHost() != null && !entity.getHost().isBlank()
                ? entity.getHost().trim()
                : "localhost";
        boolean https = defaultHttps;
        String remainder = raw;
        String lower = raw.toLowerCase(Locale.ROOT);
        if (lower.startsWith("https://")) {
            https = true;
            remainder = raw.substring("https://".length());
        } else if (lower.startsWith("http://")) {
            https = false;
            remainder = raw.substring("http://".length());
        }
        int slash = remainder.indexOf('/');
        String hostPort = slash >= 0 ? remainder.substring(0, slash) : remainder;
        String host = hostPort;
        int embeddedPort = -1;
        int colon = hostPort.lastIndexOf(':');
        if (colon > 0 && hostPort.indexOf(']') < 0) {
            String maybePort = hostPort.substring(colon + 1);
            if (!maybePort.isEmpty() && maybePort.chars().allMatch(Character::isDigit)) {
                embeddedPort = parsePort(maybePort, -1);
                if (embeddedPort > 0) {
                    host = hostPort.substring(0, colon);
                } else {
                    embeddedPort = -1;
                }
            }
        }
        if (host.isBlank()) {
            host = "localhost";
        }
        return new ParsedHost(host, embeddedPort, https);
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
        String token = username + ":" + (password == null ? "" : password);
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

    static boolean booleanProperty(String advancedConfig, String key, boolean defaultValue) {
        String value = readProperty(advancedConfig, key, null);
        if (value == null) {
            return defaultValue;
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        if ("true".equals(normalized) || "1".equals(normalized) || "yes".equals(normalized) || "on".equals(normalized)) {
            return true;
        }
        if ("false".equals(normalized) || "0".equals(normalized) || "no".equals(normalized) || "off".equals(normalized)) {
            return false;
        }
        return defaultValue;
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

    private record ParsedHost(String host, int port, boolean https) {
    }
}
