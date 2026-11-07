package org.apache.datawise.backend.platform.schedule;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Generic HTTP call used by {@code http_trigger} scheduled tasks (Airflow / dbt Cloud / Flink REST, etc.).
 */
final class OrchestrationHttpSupport {

    private OrchestrationHttpSupport() {
    }

    static Result execute(JsonNode payload, ObjectMapper objectMapper, HttpClient httpClient) throws Exception {
        String url = text(payload, "url");
        URI uri = URI.create(url);
        String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.ROOT) : "";
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            throw new IllegalArgumentException("url must be http or https");
        }

        String method = payload.has("method") && !payload.get("method").isNull()
                ? payload.get("method").asText("POST").trim().toUpperCase(Locale.ROOT)
                : "POST";
        if (!method.equals("POST") && !method.equals("PUT") && !method.equals("PATCH") && !method.equals("GET")) {
            throw new IllegalArgumentException("unsupported HTTP method: " + method);
        }

        int timeoutMs = payload.has("timeoutMs") ? payload.get("timeoutMs").asInt(10000) : 10000;
        timeoutMs = Math.max(1000, Math.min(timeoutMs, 60000));
        int statusMin = payload.has("successStatusMin") ? payload.get("successStatusMin").asInt(200) : 200;
        int statusMax = payload.has("successStatusMax") ? payload.get("successStatusMax").asInt(299) : 299;

        String body = null;
        if (payload.has("bodyJson") && !payload.get("bodyJson").isNull()) {
            JsonNode bodyNode = payload.get("bodyJson");
            body = bodyNode.isTextual() ? bodyNode.asText() : objectMapper.writeValueAsString(bodyNode);
        } else if (payload.has("body") && !payload.get("body").isNull()) {
            body = payload.get("body").asText("");
        }

        HttpRequest.Builder builder = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofMillis(timeoutMs))
                .header("User-Agent", "DataWise-Orchestration/1.0");

        Map<String, String> headers = readHeaders(payload.get("headers"));
        boolean hasContentType = false;
        for (Map.Entry<String, String> header : headers.entrySet()) {
            builder.header(header.getKey(), header.getValue());
            if ("content-type".equalsIgnoreCase(header.getKey())) {
                hasContentType = true;
            }
        }

        if ("GET".equals(method)) {
            builder.GET();
        } else {
            byte[] bytes = body != null ? body.getBytes(StandardCharsets.UTF_8) : new byte[0];
            if (!hasContentType && bytes.length > 0) {
                builder.header("Content-Type", "application/json; charset=utf-8");
            }
            builder.method(method, HttpRequest.BodyPublishers.ofByteArray(bytes));
        }

        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        int status = response.statusCode();
        String responseBody = response.body() != null ? response.body() : "";
        if (status < statusMin || status > statusMax) {
            throw new IllegalArgumentException(
                    "HTTP " + status + " outside " + statusMin + "-" + statusMax
                            + (responseBody.isBlank() ? "" : ": " + clip(responseBody, 240))
            );
        }
        return new Result(status, clip(responseBody, 500), responseBody, method, url);
    }

    /**
     * GET remote status using the same auth headers as the trigger payload.
     * Resolves {@code statusUrl} or {@code statusUrlTemplate} with {@code {dag_run_id}} / {@code {run_id}} / {@code {ref}}.
     */
    static Result fetchStatus(
            JsonNode payload,
            String orchestrationRef,
            ObjectMapper objectMapper,
            HttpClient httpClient
    ) throws Exception {
        String statusUrl = resolveStatusUrl(payload, orchestrationRef);
        URI uri = URI.create(statusUrl);
        String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.ROOT) : "";
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            throw new IllegalArgumentException("statusUrl must be http or https");
        }
        int timeoutMs = payload.has("timeoutMs") ? payload.get("timeoutMs").asInt(10000) : 10000;
        timeoutMs = Math.max(1000, Math.min(timeoutMs, 60000));

        HttpRequest.Builder builder = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofMillis(timeoutMs))
                .header("User-Agent", "DataWise-Orchestration/1.0")
                .GET();
        for (Map.Entry<String, String> header : readHeaders(payload.get("headers")).entrySet()) {
            builder.header(header.getKey(), header.getValue());
        }
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        int status = response.statusCode();
        String responseBody = response.body() != null ? response.body() : "";
        if (status < 200 || status >= 300) {
            throw new IllegalArgumentException(
                    "Status HTTP " + status
                            + (responseBody.isBlank() ? "" : ": " + clip(responseBody, 240))
            );
        }
        return new Result(status, clip(responseBody, 500), responseBody, "GET", statusUrl);
    }

    static String resolveStatusUrl(JsonNode payload, String orchestrationRef) {
        String absolute = payload.has("statusUrl") && !payload.get("statusUrl").isNull()
                ? payload.get("statusUrl").asText("").trim()
                : "";
        if (!absolute.isEmpty()) {
            return absolute;
        }
        String template = payload.has("statusUrlTemplate") && !payload.get("statusUrlTemplate").isNull()
                ? payload.get("statusUrlTemplate").asText("").trim()
                : "";
        if (template.isEmpty()) {
            throw new IllegalArgumentException(
                    "statusUrl or statusUrlTemplate is required to poll orchestration status"
            );
        }
        String ref = orchestrationRef != null ? orchestrationRef.trim() : "";
        if (ref.isEmpty() && (template.contains("{dag_run_id}") || template.contains("{run_id}")
                || template.contains("{ref}"))) {
            throw new IllegalArgumentException(
                    "orchestrationRef is required for statusUrlTemplate (run the trigger first)"
            );
        }
        return template
                .replace("{dag_run_id}", ref)
                .replace("{run_id}", ref)
                .replace("{ref}", ref);
    }

    static String extractRef(String body, ObjectMapper objectMapper) {
        JsonNode root = parseJsonQuietly(body, objectMapper);
        if (root == null || !root.isObject()) {
            return null;
        }
        for (String key : new String[]{"dag_run_id", "dagRunId", "flow_run_id", "flowRunId", "run_id", "runId", "id"}) {
            JsonNode node = root.get(key);
            if (node != null && !node.isNull()) {
                String value = node.asText("").trim();
                if (!value.isEmpty()) {
                    return value;
                }
            }
        }
        return null;
    }

    static String extractState(String body, ObjectMapper objectMapper, JsonNode payload) {
        JsonNode root = parseJsonQuietly(body, objectMapper);
        if (root == null) {
            return null;
        }
        String path = payload != null && payload.has("statusJsonPath") && !payload.get("statusJsonPath").isNull()
                ? payload.get("statusJsonPath").asText("").trim()
                : "";
        if (!path.isEmpty()) {
            JsonNode at = root.at(path.startsWith("/") ? path : "/" + path.replace('.', '/'));
            if (at != null && !at.isMissingNode() && !at.isNull()) {
                String value = at.asText("").trim();
                if (!value.isEmpty()) {
                    return value.toLowerCase(Locale.ROOT);
                }
            }
        }
        if (root.isObject()) {
            for (String key : new String[]{"state", "status", "lifecycle_state"}) {
                JsonNode node = root.get(key);
                if (node != null && !node.isNull()) {
                    String value = node.asText("").trim();
                    if (!value.isEmpty()) {
                        return value.toLowerCase(Locale.ROOT);
                    }
                }
            }
            JsonNode data = root.get("data");
            if (data != null && data.isObject()) {
                for (String key : new String[]{"state", "status"}) {
                    JsonNode node = data.get(key);
                    if (node != null && !node.isNull()) {
                        String value = node.asText("").trim();
                        if (!value.isEmpty()) {
                            return value.toLowerCase(Locale.ROOT);
                        }
                    }
                }
            }
        }
        return null;
    }

    private static JsonNode parseJsonQuietly(String body, ObjectMapper objectMapper) {
        if (body == null || body.isBlank() || objectMapper == null) {
            return null;
        }
        try {
            return objectMapper.readTree(body);
        } catch (Exception ex) {
            return null;
        }
    }

    private static Map<String, String> readHeaders(JsonNode node) {
        Map<String, String> headers = new LinkedHashMap<>();
        if (node == null || !node.isObject()) {
            return headers;
        }
        Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            if (entry.getKey() == null || entry.getKey().isBlank() || entry.getValue() == null || entry.getValue().isNull()) {
                continue;
            }
            headers.put(entry.getKey().trim(), entry.getValue().asText(""));
        }
        return headers;
    }

    private static String text(JsonNode node, String field) {
        if (!node.has(field) || node.get(field).isNull()) {
            throw new IllegalArgumentException(field + " is required in payload");
        }
        String value = node.get(field).asText("").trim();
        if (value.isEmpty()) {
            throw new IllegalArgumentException(field + " is required in payload");
        }
        return value;
    }

    private static String clip(String value, int max) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        if (trimmed.length() <= max) {
            return trimmed;
        }
        return trimmed.substring(0, Math.max(0, max - 3)) + "...";
    }

    record Result(int statusCode, String bodyPreview, String body, String method, String url) {
    }
}
