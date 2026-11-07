package org.apache.datawise.backend.service.outbound;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Locale;
import java.util.Map;

/**
 * Extracts a browseable ticket URL from GitHub / GitLab / Jira create-issue HTTP responses (G10).
 */
public final class OutboundTicketUrlSupport {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    private OutboundTicketUrlSupport() {
    }

    public static String extractTicketUrl(String channel, String responseBody) {
        if (responseBody == null || responseBody.isBlank()) {
            return null;
        }
        String normalized = channel != null ? channel.trim().toLowerCase(Locale.ROOT) : "";
        try {
            Map<String, Object> root = JSON.readValue(responseBody, MAP_TYPE);
            if (root == null || root.isEmpty()) {
                return null;
            }
            return switch (normalized) {
                case "github_issue" -> text(root, "html_url");
                case "gitlab_issue" -> firstNonBlank(text(root, "web_url"), text(root, "html_url"));
                case "jira_issue" -> jiraBrowseUrl(root);
                default -> firstNonBlank(text(root, "html_url"), text(root, "web_url"), text(root, "url"));
            };
        } catch (Exception ex) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private static String jiraBrowseUrl(Map<String, Object> root) {
        String key = text(root, "key");
        Object self = root.get("self");
        if (self instanceof String selfUrl && !selfUrl.isBlank() && key != null) {
            // https://host.atlassian.net/rest/api/3/issue/10001 → https://host.atlassian.net/browse/KEY
            int rest = selfUrl.indexOf("/rest/");
            if (rest > 0) {
                return selfUrl.substring(0, rest) + "/browse/" + key;
            }
        }
        Object fields = root.get("fields");
        if (fields instanceof Map<?, ?> fieldMap) {
            Object url = fieldMap.get("url");
            if (url != null && !String.valueOf(url).isBlank()) {
                return String.valueOf(url).trim();
            }
        }
        return firstNonBlank(text(root, "self"), key);
    }

    private static String text(Map<String, Object> root, String field) {
        Object value = root.get(field);
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }
}
