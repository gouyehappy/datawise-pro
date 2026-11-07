package org.apache.datawise.desktop.deeplink;

import com.google.gson.JsonObject;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Parses {@code datawise://open?...} payloads for the renderer deep-link listener.
 */
public final class DeepLinkParser {
    private DeepLinkParser() {
    }

    public static JsonObject parse(String rawUrl) {
        JsonObject out = new JsonObject();
        if (rawUrl == null || rawUrl.isBlank()) {
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
            out.addProperty("raw", normalized);
            out.addProperty("action", action == null || action.isBlank() ? "open" : action);
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
            JsonObject fallback = new JsonObject();
            fallback.addProperty("raw", rawUrl);
            fallback.addProperty("action", "open");
            fallback.add("params", new JsonObject());
            return fallback;
        }
    }

    private static Map<String, String> parseQuery(String rawQuery) {
        Map<String, String> map = new LinkedHashMap<>();
        if (rawQuery == null || rawQuery.isBlank()) {
            return map;
        }
        for (String part : rawQuery.split("&")) {
            int eq = part.indexOf('=');
            if (eq < 0) {
                map.put(decode(part), "");
            } else {
                map.put(decode(part.substring(0, eq)), decode(part.substring(eq + 1)));
            }
        }
        return map;
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }
}
