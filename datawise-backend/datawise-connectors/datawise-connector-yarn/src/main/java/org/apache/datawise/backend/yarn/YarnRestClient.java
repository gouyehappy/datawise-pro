package org.apache.datawise.backend.yarn;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** YARN Resource Manager REST API v1 client. */
public final class YarnRestClient {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Duration TIMEOUT = Duration.ofSeconds(15);

    private final YarnConnectionConfig config;
    private final HttpClient httpClient;

    public YarnRestClient(YarnConnectionConfig config) {
        this.config = config;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    public JsonNode clusterInfo() throws IOException, InterruptedException {
        return getJson("/info");
    }

    public JsonNode listApplications(String state, String user, String queue, int limit)
            throws IOException, InterruptedException {
        Map<String, String> params = new LinkedHashMap<>();
        if (state != null && !state.isBlank()) {
            params.put("states", state.trim().toUpperCase());
        }
        if (user != null && !user.isBlank()) {
            params.put("user", user.trim());
        }
        if (queue != null && !queue.isBlank()) {
            params.put("queue", queue.trim());
        }
        if (limit > 0) {
            params.put("limit", String.valueOf(limit));
        }
        return getJson("/apps", params);
    }

    public JsonNode describeApplication(String appId) throws IOException, InterruptedException {
        return getJson("/apps/" + encodePath(appId));
    }

    public JsonNode listNodes(int limit) throws IOException, InterruptedException {
        Map<String, String> params = new LinkedHashMap<>();
        if (limit > 0) {
            params.put("limit", String.valueOf(limit));
        }
        return getJson("/nodes", params);
    }

    public JsonNode schedulerInfo() throws IOException, InterruptedException {
        return getJson("/scheduler");
    }

    public JsonNode killApplication(String appId, String diagnostics) throws IOException, InterruptedException {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("state", "KILLED");
        if (diagnostics != null && !diagnostics.isBlank()) {
            body.put("diagnostics", diagnostics.trim());
        }
        return putJson("/apps/" + encodePath(appId) + "/state", body);
    }

    public JsonNode moveApplicationQueue(String appId, String queue) throws IOException, InterruptedException {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("queue", queue.trim());
        return putJson("/apps/" + encodePath(appId) + "/queue", body);
    }

    public String updateSchedulerQueue(String queueName, Map<String, String> params)
            throws IOException, InterruptedException {
        return putRawJson("/scheduler-conf", YarnSchedulerConfSupport.buildUpdateQueuePayload(queueName, params));
    }

    public String removeSchedulerQueue(String queueName) throws IOException, InterruptedException {
        return putRawJson("/scheduler-conf", YarnSchedulerConfSupport.buildRemoveQueuePayload(queueName));
    }

    JsonNode putJson(String path, ObjectNode body) throws IOException, InterruptedException {
        String response = putRawJson(path, MAPPER.writeValueAsString(body));
        if (response == null || response.isBlank()) {
            return MAPPER.createObjectNode();
        }
        return MAPPER.readTree(response);
    }

    String putRawJson(String path, String jsonBody) throws IOException, InterruptedException {
        String url = config.baseUrl() + path;
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(TIMEOUT)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8));
        if (config.authorizationHeader() != null) {
            builder.header("Authorization", config.authorizationHeader());
        }
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        int status = response.statusCode();
        if (status == 202 || status == 200 || status == 204) {
            return response.body();
        }
        throw new IOException("YARN REST request failed (" + status + "): " + response.body());
    }

    JsonNode getJson(String path) throws IOException, InterruptedException {
        return getJson(path, Map.of());
    }

    JsonNode getJson(String path, Map<String, String> queryParams) throws IOException, InterruptedException {
        String url = config.baseUrl() + path + buildQuery(queryParams);
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(TIMEOUT)
                .GET();
        if (config.authorizationHeader() != null) {
            builder.header("Authorization", config.authorizationHeader());
        }
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("YARN REST request failed (" + response.statusCode() + "): " + response.body());
        }
        return MAPPER.readTree(response.body());
    }

    static List<JsonNode> arrayOrSingle(JsonNode parent, String field) {
        if (parent == null || parent.isMissingNode() || parent.isNull()) {
            return List.of();
        }
        JsonNode node = parent.path(field);
        if (node.isMissingNode() || node.isNull()) {
            return List.of();
        }
        if (node.isArray()) {
            List<JsonNode> items = new ArrayList<>();
            for (JsonNode item : node) {
                items.add(item);
            }
            return items;
        }
        return List.of(node);
    }

    static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        return value.asText(null);
    }

    static long longValue(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull() || !value.isNumber()) {
            return 0L;
        }
        return value.asLong();
    }

    static int intValue(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull() || !value.isNumber()) {
            return 0;
        }
        return value.asInt();
    }

    static double doubleValue(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull() || !value.isNumber()) {
            return 0.0;
        }
        return value.asDouble();
    }

    static float floatValue(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull() || !value.isNumber()) {
            return 0.0f;
        }
        return (float) value.asDouble();
    }

    static void collectQueues(JsonNode queueNode, List<JsonNode> out) {
        if (queueNode == null || queueNode.isMissingNode() || queueNode.isNull()) {
            return;
        }
        out.add(queueNode);
        JsonNode childQueues = queueNode.path("queues");
        if (childQueues.isMissingNode() || childQueues.isNull()) {
            return;
        }
        for (JsonNode child : arrayOrSingle(childQueues, "queue")) {
            collectQueues(child, out);
        }
        for (Iterator<Map.Entry<String, JsonNode>> it = childQueues.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> entry = it.next();
            if ("queue".equals(entry.getKey())) {
                continue;
            }
            collectQueues(entry.getValue(), out);
        }
    }

    private static String buildQuery(Map<String, String> params) {
        if (params == null || params.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder("?");
        boolean first = true;
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (entry.getValue() == null || entry.getValue().isBlank()) {
                continue;
            }
            if (!first) {
                sb.append('&');
            }
            first = false;
            sb.append(encodeQuery(entry.getKey())).append('=').append(encodeQuery(entry.getValue()));
        }
        return first ? "" : sb.toString();
    }

    private static String encodePath(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String encodeQuery(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
