package org.apache.datawise.backend.kubernetes;

import org.apache.datawise.backend.model.ConnectionEntity;

import java.net.URI;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Connection settings for Kubernetes API server. */
public final class KubernetesConnectionConfig {

    private static final Pattern SERVER_PATTERN = Pattern.compile(
            "(?m)^\\s*server:\\s*[\"']?([^\\s\"'#]+)[\"']?"
    );
    private static final Pattern TOKEN_PATTERN = Pattern.compile(
            "(?m)^\\s*token:\\s*[\"']?([^\\s\"'#]+)[\"']?"
    );

    private final String apiServerBase;
    private final String bearerToken;
    private final boolean insecureSkipTlsVerify;

    private KubernetesConnectionConfig(String apiServerBase, String bearerToken, boolean insecureSkipTlsVerify) {
        this.apiServerBase = apiServerBase;
        this.bearerToken = bearerToken;
        this.insecureSkipTlsVerify = insecureSkipTlsVerify;
    }

    public static KubernetesConnectionConfig from(ConnectionEntity entity) {
        boolean insecure = readBoolean(entity != null ? entity.getAdvancedConfig() : null, "insecureSkipTlsVerify", true);
        String authType = entity != null && entity.getAuthType() != null
                ? entity.getAuthType().trim().toLowerCase(Locale.ROOT)
                : "";
        if ("kubeconfig".equals(authType)) {
            return fromKubeconfig(entity, insecure);
        }
        // token / User&Password / empty → bearer token in password field
        return fromToken(entity, insecure);
    }

    private static KubernetesConnectionConfig fromToken(ConnectionEntity entity, boolean insecure) {
        ParsedEndpoint endpoint = resolveEndpoint(entity);
        boolean useHttps = endpoint.https();
        String explicitHttps = readProperty(entity != null ? entity.getAdvancedConfig() : null, "useHttps", null);
        if (explicitHttps != null) {
            useHttps = "true".equalsIgnoreCase(explicitHttps.trim()) || "1".equals(explicitHttps.trim());
        } else if (!endpoint.schemeSpecified()) {
            useHttps = true;
        }
        String scheme = useHttps ? "https" : "http";
        String base = scheme + "://" + endpoint.host() + ":" + endpoint.port();
        String token = entity != null ? entity.getPassword() : null;
        if (token != null) {
            token = token.trim();
            if (token.isEmpty()) {
                token = null;
            }
        }
        return new KubernetesConnectionConfig(base, token, insecure && useHttps);
    }

    /**
     * Accept host, {@code https://host:6443}, or a pasted API server URL.
     */
    static ParsedEndpoint resolveEndpoint(ConnectionEntity entity) {
        String raw = entity != null && entity.getHost() != null && !entity.getHost().isBlank()
                ? entity.getHost().trim()
                : "localhost";
        boolean https = false;
        boolean schemeSpecified = false;
        String remainder = raw;
        String lower = raw.toLowerCase(Locale.ROOT);
        if (lower.startsWith("https://")) {
            https = true;
            schemeSpecified = true;
            remainder = raw.substring("https://".length());
        } else if (lower.startsWith("http://")) {
            https = false;
            schemeSpecified = true;
            remainder = raw.substring("http://".length());
        }

        int slash = remainder.indexOf('/');
        String hostPort = slash >= 0 ? remainder.substring(0, slash) : remainder;

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
                : parsePort(entity != null ? entity.getPort() : null, https ? 443 : 6443);
        return new ParsedEndpoint(host, port, https, schemeSpecified);
    }

    record ParsedEndpoint(String host, int port, boolean https, boolean schemeSpecified) {
    }

    private static KubernetesConnectionConfig fromKubeconfig(ConnectionEntity entity, boolean insecure) {
        String kubeconfig = entity != null ? entity.getPassword() : null;
        if (kubeconfig == null || kubeconfig.isBlank()) {
            kubeconfig = entity != null ? entity.getAdvancedConfig() : null;
        }
        if (kubeconfig == null || kubeconfig.isBlank()) {
            throw new IllegalArgumentException("kubeconfig content is required (store in password field)");
        }
        Matcher serverMatcher = SERVER_PATTERN.matcher(kubeconfig);
        if (!serverMatcher.find()) {
            throw new IllegalArgumentException("kubeconfig missing cluster server URL");
        }
        String server = serverMatcher.group(1).trim();
        while (server.endsWith("/")) {
            server = server.substring(0, server.length() - 1);
        }
        Matcher tokenMatcher = TOKEN_PATTERN.matcher(kubeconfig);
        String token = tokenMatcher.find() ? tokenMatcher.group(1).trim() : null;
        boolean https = server.toLowerCase(Locale.ROOT).startsWith("https://");
        return new KubernetesConnectionConfig(server, token, insecure && https);
    }

    public String apiServerBase() {
        return apiServerBase;
    }

    public String bearerToken() {
        return bearerToken;
    }

    public boolean insecureSkipTlsVerify() {
        return insecureSkipTlsVerify;
    }

    public URI resolve(String path) {
        String normalized = path == null || path.isBlank() ? "/" : path;
        if (!normalized.startsWith("/")) {
            normalized = "/" + normalized;
        }
        return URI.create(apiServerBase + normalized);
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

    static boolean readBoolean(String advancedConfig, String key, boolean defaultValue) {
        String value = readProperty(advancedConfig, key, null);
        if (value == null) {
            return defaultValue;
        }
        return "true".equalsIgnoreCase(value.trim()) || "1".equals(value.trim());
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
}
