package org.apache.datawise.backend.nacos;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/** Nacos Open API client. */
public final class NacosRestClient {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Duration TIMEOUT = Duration.ofSeconds(20);

    private final NacosConnectionConfig config;
    private final HttpClient httpClient;
    private String accessToken;

    public NacosRestClient(NacosConnectionConfig config) {
        this.config = config;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public void ensureLogin() throws IOException, InterruptedException {
        if (!config.hasCredentials() || accessToken != null) {
            return;
        }
        String loginPath = config.v3Api() ? "/v3/auth/user/login" : "/v1/auth/login";
        String form = "username=" + encode(config.username())
                + "&password=" + encode(config.password() != null ? config.password() : "");
        HttpResponse<String> response = httpClient.send(
                HttpRequest.newBuilder(URI.create(config.baseUrl() + loginPath))
                        .timeout(TIMEOUT)
                        .header("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
                        .POST(HttpRequest.BodyPublishers.ofString(form, StandardCharsets.UTF_8))
                        .build(),
                HttpResponse.BodyHandlers.ofString()
        );
        requireOk(response, "Nacos login");
        JsonNode root = MAPPER.readTree(response.body() != null ? response.body() : "{}");
        JsonNode tokenNode = config.v3Api() && root.path("data").isObject() ? root.path("data") : root;
        String token = firstText(tokenNode, "accessToken", "access_token", "token");
        if (token == null) {
            token = firstText(root, "accessToken", "access_token", "token");
        }
        // Some deployments (auth soft-disabled) return HTTP 200 with empty accessToken and still
        // allow OpenAPI without a token — treat blank token as anonymous mode.
        if (token != null && !token.isBlank()) {
            this.accessToken = token;
        } else {
            this.accessToken = "";
        }
    }

    public JsonNode listNamespaces() throws IOException, InterruptedException {
        return getJson(config.v3Api() ? "/v3/console/core/namespace/list" : "/v1/console/namespaces");
    }

    public JsonNode listConfigs(String dataId, String group, String tenant, int pageSize)
            throws IOException, InterruptedException {
        // Nacos treats missing dataId as "get config" (required) vs search when dataId is present
        // (even empty) together with search=blur|accurate.
        boolean v3 = config.v3Api();
        StringBuilder path = new StringBuilder(v3
                ? "/v3/console/cs/config/list?search=blur&pageNo=1&pageSize="
                : "/v1/cs/configs?search=blur&pageNo=1&pageSize=")
                .append(Math.max(1, pageSize));
        appendQuery(path, "dataId", dataId != null ? dataId : "");
        appendQuery(path, v3 ? "groupName" : "group", group != null ? group : "");
        appendQuery(path, v3 ? "namespaceId" : "tenant", tenant != null ? tenant : "");
        return getJson(path.toString());
    }

    public JsonNode getConfig(String dataId, String group, String tenant)
            throws IOException, InterruptedException {
        boolean v3 = config.v3Api();
        StringBuilder path = new StringBuilder(v3 ? "/v3/console/cs/config?dataId=" : "/v1/cs/configs?show=all&dataId=")
                .append(encode(dataId));
        appendQuery(path, v3 ? "groupName" : "group", group != null && !group.isBlank() ? group : "DEFAULT_GROUP");
        appendQuery(path, v3 ? "namespaceId" : "tenant", tenant);
        return getJson(path.toString());
    }

    /**
     * Publish (create or update) a config via {@code POST /v1/cs/configs}.
     * Nacos returns plain {@code true}/{@code false} text on success/failure.
     */
    public boolean publishConfig(String dataId, String group, String tenant, String content, String type)
            throws IOException, InterruptedException {
        ensureLogin();
        boolean v3 = config.v3Api();
        StringBuilder form = new StringBuilder();
        appendForm(form, "dataId", dataId);
        appendForm(form, v3 ? "groupName" : "group", group != null && !group.isBlank() ? group : "DEFAULT_GROUP");
        appendForm(form, "content", content != null ? content : "");
        appendForm(form, v3 ? "namespaceId" : "tenant", tenant != null ? tenant : "");
        if (type != null && !type.isBlank()) {
            appendForm(form, "type", type);
        }
        String url = config.baseUrl() + (config.v3Api() ? "/v3/console/cs/config" : "/v1/cs/configs");
        if (accessToken != null && !accessToken.isBlank()) {
            url += "?accessToken=" + encode(accessToken);
        }
        HttpResponse<String> response = httpClient.send(
                HttpRequest.newBuilder(URI.create(url))
                        .timeout(TIMEOUT)
                        .header("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
                        .header("Accept", "application/json, text/plain, */*")
                        .POST(HttpRequest.BodyPublishers.ofString(form.toString(), StandardCharsets.UTF_8))
                        .build(),
                HttpResponse.BodyHandlers.ofString()
        );
        requireOk(response, "Nacos publish config");
        String body = response.body() != null ? response.body().trim() : "";
        if ("true".equalsIgnoreCase(body)) {
            return true;
        }
        if ("false".equalsIgnoreCase(body)) {
            throw new IOException("Nacos publish config failed: server returned false");
        }
        // Some versions wrap boolean in JSON.
        if (body.startsWith("{") || body.startsWith("[")) {
            JsonNode root = MAPPER.readTree(body.isBlank() ? "{}" : body);
            if (root.isBoolean()) {
                if (!root.asBoolean()) {
                    throw new IOException("Nacos publish config failed: server returned false");
                }
                return true;
            }
            if (root.has("data") && root.path("data").isBoolean() && !root.path("data").asBoolean()) {
                throw new IOException("Nacos publish config failed: server returned false");
            }
        }
        return true;
    }

    public JsonNode listServices(String namespaceId, int pageSize) throws IOException, InterruptedException {
        boolean v3 = config.v3Api();
        StringBuilder path = new StringBuilder(v3
                ? "/v3/console/ns/service/list?pageNo=1&pageSize="
                : "/v1/ns/service/list?pageNo=1&pageSize=")
                .append(Math.max(1, pageSize));
        appendQuery(path, "namespaceId", namespaceId != null ? namespaceId : "");
        return getJson(path.toString());
    }

    public JsonNode listInstances(String serviceName, String groupName, String namespaceId)
            throws IOException, InterruptedException {
        boolean v3 = config.v3Api();
        StringBuilder path = new StringBuilder(v3
                ? "/v3/console/ns/instance/list?serviceName="
                : "/v1/ns/instance/list?serviceName=")
                .append(encode(serviceName != null ? serviceName : ""));
        appendQuery(path, "groupName", groupName != null && !groupName.isBlank() ? groupName : "DEFAULT_GROUP");
        appendQuery(path, "namespaceId", namespaceId != null ? namespaceId : "");
        return getJson(path.toString());
    }

    JsonNode getJson(String path) throws IOException, InterruptedException {
        ensureLogin();
        String url = config.baseUrl() + path;
        if (accessToken != null && !accessToken.isBlank()) {
            url += (path.contains("?") ? "&" : "?") + "accessToken=" + encode(accessToken);
        }
        HttpResponse<String> response = httpClient.send(
                HttpRequest.newBuilder(URI.create(url))
                        .timeout(TIMEOUT)
                        .header("Accept", "application/json")
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString()
        );
        requireOk(response, "Nacos REST request");
        return MAPPER.readTree(response.body() != null ? response.body() : "{}");
    }

    private static void requireOk(HttpResponse<String> response, String action) throws IOException {
        int status = response.statusCode();
        if (status < 200 || status >= 300) {
            throw new IOException(action + " failed (" + status + "): " + clip(response.body()));
        }
    }

    private static void appendQuery(StringBuilder path, String key, String value) {
        path.append('&').append(key).append('=').append(encode(value != null ? value : ""));
    }

    private static void appendForm(StringBuilder form, String key, String value) {
        if (!form.isEmpty()) {
            form.append('&');
        }
        form.append(encode(key)).append('=').append(encode(value != null ? value : ""));
    }

    static JsonNode unwrapDataObject(JsonNode root) {
        if (root != null && root.isObject() && root.has("code") && root.path("data").isObject()) {
            return root.path("data");
        }
        return root;
    }

    static List<JsonNode> array(JsonNode parent, String field) {
        if (parent == null || parent.isMissingNode() || parent.isNull()) {
            return List.of();
        }
        JsonNode node = parent.path(field);
        if (!node.isArray()) {
            return List.of();
        }
        List<JsonNode> items = new ArrayList<>();
        for (JsonNode item : node) {
            items.add(item);
        }
        return items;
    }

    static String text(JsonNode node, String field) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String text = value.asText(null);
        return text != null && !text.isBlank() ? text : null;
    }

    static String firstText(JsonNode node, String... fields) {
        for (String field : fields) {
            String value = text(node, field);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    static int intValue(JsonNode node, String field) {
        if (node == null) {
            return 0;
        }
        JsonNode value = node.path(field);
        return value.isNumber() ? value.asInt() : 0;
    }

    static double doubleValue(JsonNode node, String field) {
        if (node == null) {
            return 0;
        }
        JsonNode value = node.path(field);
        return value.isNumber() ? value.asDouble() : 0;
    }

    static boolean bool(JsonNode node, String field) {
        if (node == null) {
            return false;
        }
        JsonNode value = node.path(field);
        return value.isBoolean() && value.asBoolean();
    }

    static String metadataText(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        JsonNode metadata = node.path("metadata");
        if (metadata.isMissingNode() || metadata.isNull()) {
            return null;
        }
        if (metadata.isTextual()) {
            String text = metadata.asText(null);
            return text != null && !text.isBlank() ? text : null;
        }
        return metadata.toString();
    }

    private static String encode(String value) {
        return URLEncoder.encode(value != null ? value : "", StandardCharsets.UTF_8);
    }

    private static String clip(String body) {
        if (body == null) {
            return "";
        }
        String trimmed = body.trim();
        if (trimmed.length() <= 240) {
            return trimmed;
        }
        return trimmed.substring(0, 237) + "...";
    }
}
