package org.apache.datawise.community.jenkins;

import com.fasterxml.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Locale;
import java.util.Objects;

/** Parsed Jenkins connection settings from host lifecycle payload. */
public final class JenkinsConfig {

    private final String id;
    private final String baseUrl;
    private final String authorizationHeader;
    private final boolean https;
    private final boolean readOnly;
    private final boolean insecureSkipTls;
    private final int connectTimeoutSecs;
    private final Path downloadDir;

    private JenkinsConfig(
            String id,
            String baseUrl,
            String authorizationHeader,
            boolean https,
            boolean readOnly,
            boolean insecureSkipTls,
            int connectTimeoutSecs,
            Path downloadDir
    ) {
        this.id = id;
        this.baseUrl = baseUrl;
        this.authorizationHeader = authorizationHeader;
        this.https = https;
        this.readOnly = readOnly;
        this.insecureSkipTls = insecureSkipTls;
        this.connectTimeoutSecs = connectTimeoutSecs;
        this.downloadDir = downloadDir;
    }

    public static JenkinsConfig fromConnection(JsonNode connection) {
        Objects.requireNonNull(connection, "connection");
        String id = text(connection, "id", "anon");
        String host = firstNonBlank(
                text(connection, "host", null),
                cfg(connection, "host"),
                "localhost"
        );
        int port = parsePort(
                firstNonBlank(text(connection, "port", null), cfg(connection, "port")),
                8080
        );
        String protocol = firstNonBlank(cfg(connection, "protocol"), "http").toLowerCase(Locale.ROOT);
        boolean https = "https".equals(protocol) || "true".equalsIgnoreCase(cfg(connection, "useHttps"));
        String contextPath = normalizeContextPath(firstNonBlank(cfg(connection, "context_path"), cfg(connection, "contextPath"), ""));
        String username = firstNonBlank(
                text(connection, "username", null),
                text(connection, "user", null),
                cfg(connection, "username"),
                ""
        );
        String secret = firstNonBlank(
                text(connection, "password", null),
                secret(connection, "api_token"),
                secret(connection, "password"),
                cfg(connection, "api_token"),
                ""
        );
        boolean readOnly = bool(cfg(connection, "read_only")) || bool(text(connection, "readOnly", null));
        boolean insecure = bool(cfg(connection, "insecure_skip_tls")) || bool(cfg(connection, "insecureSkipTls"));
        int timeout = parsePort(cfg(connection, "connect_timeout_secs"), 15);
        if (timeout <= 0) {
            timeout = 15;
        }
        Path downloadDir = resolveDownloadDir(cfg(connection, "download_dir"));
        String scheme = https ? "https" : "http";
        String baseUrl = scheme + "://" + host + ":" + port + contextPath;
        String auth = null;
        if (username != null && !username.isBlank()) {
            String token = username.trim() + ":" + (secret != null ? secret : "");
            auth = "Basic " + Base64.getEncoder().encodeToString(token.getBytes(StandardCharsets.UTF_8));
        }
        return new JenkinsConfig(id, baseUrl, auth, https, readOnly, insecure, timeout, downloadDir);
    }

    public String id() {
        return id;
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

    public boolean readOnly() {
        return readOnly;
    }

    public boolean insecureSkipTls() {
        return insecureSkipTls;
    }

    public int connectTimeoutSecs() {
        return connectTimeoutSecs;
    }

    public Path downloadDir() {
        return downloadDir;
    }

    static String normalizeContextPath(String contextPath) {
        if (contextPath == null) {
            return "";
        }
        String value = contextPath.trim();
        if (value.isEmpty() || "/".equals(value)) {
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

    static Path resolveDownloadDir(String configured) {
        if (configured != null && !configured.isBlank()) {
            return Path.of(configured.trim());
        }
        return Path.of(System.getProperty("user.home"), "Downloads");
    }

    private static String cfg(JsonNode connection, String key) {
        JsonNode ext = connection.path("external_config");
        if (ext.isObject() && ext.has(key) && !ext.get(key).isNull()) {
            String v = ext.get(key).asText(null);
            if (v != null && !v.isBlank()) {
                return v.trim();
            }
        }
        // Host may also flatten config keys onto the connection object.
        if (connection.has(key) && !connection.get(key).isNull()) {
            String v = connection.get(key).asText(null);
            if (v != null && !v.isBlank()) {
                return v.trim();
            }
        }
        return null;
    }

    private static String secret(JsonNode connection, String key) {
        JsonNode secrets = connection.path("connection_secrets");
        if (secrets.isObject() && secrets.has(key) && !secrets.get(key).isNull()) {
            String v = secrets.get(key).asText(null);
            if (v != null && !v.isBlank()) {
                return v;
            }
        }
        return null;
    }

    private static String text(JsonNode node, String field, String defaultValue) {
        if (node == null || !node.has(field) || node.get(field).isNull()) {
            return defaultValue;
        }
        String v = node.get(field).asText(null);
        if (v == null || v.isBlank()) {
            return defaultValue;
        }
        return v.trim();
    }

    private static boolean bool(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        String v = value.trim().toLowerCase(Locale.ROOT);
        return "true".equals(v) || "1".equals(v) || "yes".equals(v);
    }

    private static int parsePort(String value, int defaultValue) {
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException ex) {
            return defaultValue;
        }
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v.trim();
            }
        }
        return null;
    }
}
