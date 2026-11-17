package org.apache.datawise.desktop.deeplink;

import com.google.gson.JsonObject;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Parses {@code datawise://open?...} payloads for the renderer deep-link listener.
 */
public final class DeepLinkParser {
    private static final int MAX_RAW_URL_LENGTH = 8_192;
    private static final int MAX_PARAM_KEY_LENGTH = 64;
    private static final int MAX_CONNECTION_ID_LENGTH = 128;
    private static final int MAX_DATABASE_LENGTH = 256;
    private static final int MAX_SQL_LENGTH = 8_192;
    private static final int MAX_ACTION_LENGTH = 64;
    private static final Set<String> ALLOWED_PARAMS = Set.of("connectionId", "database", "sql");

    private DeepLinkParser() {
    }

    public static JsonObject parse(String rawUrl) {
        JsonObject out = new JsonObject();
        if (rawUrl == null || rawUrl.isBlank()) {
            return null;
        }
        if (rawUrl.length() > MAX_RAW_URL_LENGTH) {
            return null;
        }
        try {
            String normalized = rawUrl.trim();
            if (!normalized.startsWith("datawise:")) {
                return null;
            }
            // URI may reject custom schemes with empty host; normalize
            String asHttp = normalized.replaceFirst("^datawise:", "http:");
            URI uri = URI.create(asHttp);
            String host = uri.getHost();
            String path = uri.getPath();
            String action = host != null && !host.isBlank() ? host : (path != null ? path.replace("/", "") : "open");
            if (action == null || action.isBlank()) {
                action = "open";
            }
            if (action.length() > MAX_ACTION_LENGTH) {
                return null;
            }
            out.addProperty("action", action);
            Map<String, String> query = parseQuery(uri.getRawQuery());
            JsonObject params = new JsonObject();
            query.forEach(params::addProperty);
            out.add("params", params);
            if (query.containsKey("connectionId")) {
                out.addProperty("connectionId", query.get("connectionId"));
            }
            if (query.containsKey("database")) {
                out.addProperty("database", query.get("database"));
            }
            if (query.containsKey("sql")) {
                out.addProperty("sql", query.get("sql"));
            }
            return out;
        } catch (Exception e) {
            // Never echo rawUrl in error payloads — it may contain secrets or large payloads.
            return null;
        }
    }

    private static Map<String, String> parseQuery(String rawQuery) {
        Map<String, String> map = new LinkedHashMap<>();
        if (rawQuery == null || rawQuery.isBlank()) {
            return map;
        }
        for (String part : rawQuery.split("&")) {
            if (part.isEmpty()) {
                continue;
            }
            int eq = part.indexOf('=');
            String rawKey = eq < 0 ? part : part.substring(0, eq);
            String rawValue = eq < 0 ? "" : part.substring(eq + 1);
            String key = decode(rawKey);
            if (key.length() > MAX_PARAM_KEY_LENGTH || !ALLOWED_PARAMS.contains(key)) {
                continue;
            }
            String value = decode(rawValue);
            int maxLen = switch (key) {
                case "connectionId" -> MAX_CONNECTION_ID_LENGTH;
                case "database" -> MAX_DATABASE_LENGTH;
                case "sql" -> MAX_SQL_LENGTH;
                default -> MAX_PARAM_KEY_LENGTH;
            };
            if (value.length() > maxLen) {
                continue;
            }
            map.put(key, value);
        }
        return map;
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }
}
