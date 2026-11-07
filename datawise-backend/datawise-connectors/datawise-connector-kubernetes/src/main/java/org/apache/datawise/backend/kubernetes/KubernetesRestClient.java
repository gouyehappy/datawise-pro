package org.apache.datawise.backend.kubernetes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/** Kubernetes API server HTTP client (core + apps/v1). */
public final class KubernetesRestClient {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int TIMEOUT_MS = 20_000;

    private final KubernetesConnectionConfig config;

    public KubernetesRestClient(KubernetesConnectionConfig config) {
        this.config = config;
    }

    public JsonNode version() throws IOException {
        return getJson("/version");
    }

    public JsonNode listNamespaces(int limit) throws IOException {
        Map<String, String> params = new LinkedHashMap<>();
        if (limit > 0) {
            params.put("limit", String.valueOf(limit));
        }
        return getJson("/api/v1/namespaces", params);
    }

    public JsonNode listPods(String namespace, String labelSelector, String fieldSelector, int limit)
            throws IOException {
        Map<String, String> params = selectorParams(labelSelector, fieldSelector, limit);
        if (namespace == null || namespace.isBlank() || "_all".equals(namespace)) {
            return getJson("/api/v1/pods", params);
        }
        return getJson("/api/v1/namespaces/" + encodePath(namespace) + "/pods", params);
    }

    public JsonNode getPod(String namespace, String podName) throws IOException {
        return getJson("/api/v1/namespaces/" + encodePath(namespace) + "/pods/" + encodePath(podName));
    }

    public JsonNode listDeployments(String namespace, String labelSelector, int limit) throws IOException {
        Map<String, String> params = selectorParams(labelSelector, null, limit);
        if (namespace == null || namespace.isBlank() || "_all".equals(namespace)) {
            return getJson("/apis/apps/v1/deployments", params);
        }
        return getJson("/apis/apps/v1/namespaces/" + encodePath(namespace) + "/deployments", params);
    }

    public String podLogs(String namespace, String podName, String container, int tailLines) throws IOException {
        Map<String, String> params = new LinkedHashMap<>();
        if (container != null && !container.isBlank()) {
            params.put("container", container.trim());
        }
        if (tailLines > 0) {
            params.put("tailLines", String.valueOf(tailLines));
        }
        params.put("timestamps", "false");
        return getRaw(
                "/api/v1/namespaces/" + encodePath(namespace) + "/pods/" + encodePath(podName) + "/log",
                params
        );
    }

    public JsonNode listEvents(String namespace, String fieldSelector, int limit) throws IOException {
        Map<String, String> params = selectorParams(null, fieldSelector, limit);
        if (namespace == null || namespace.isBlank() || "_all".equals(namespace)) {
            return getJson("/api/v1/events", params);
        }
        return getJson("/api/v1/namespaces/" + encodePath(namespace) + "/events", params);
    }

    public void deletePod(String namespace, String podName) throws IOException {
        exchange("DELETE", "/api/v1/namespaces/" + encodePath(namespace) + "/pods/" + encodePath(podName), null, null);
    }

    public JsonNode restartDeployment(String namespace, String deploymentName) throws IOException {
        ObjectNode root = MAPPER.createObjectNode();
        ObjectNode metadata = root.putObject("metadata");
        ObjectNode annotations = metadata.putObject("annotations");
        annotations.put("kubectl.kubernetes.io/restartedAt", Instant.now().toString());
        String path = "/apis/apps/v1/namespaces/"
                + encodePath(namespace)
                + "/deployments/"
                + encodePath(deploymentName);
        return patchJson(path, "application/strategic-merge-patch+json", MAPPER.writeValueAsString(root));
    }

    public JsonNode listServices(String namespace, String labelSelector, int limit) throws IOException {
        Map<String, String> params = selectorParams(labelSelector, null, limit);
        if (namespace == null || namespace.isBlank() || "_all".equals(namespace)) {
            return getJson("/api/v1/services", params);
        }
        return getJson("/api/v1/namespaces/" + encodePath(namespace) + "/services", params);
    }

    public JsonNode listConfigMaps(String namespace, String labelSelector, int limit) throws IOException {
        Map<String, String> params = selectorParams(labelSelector, null, limit);
        if (namespace == null || namespace.isBlank() || "_all".equals(namespace)) {
            return getJson("/api/v1/configmaps", params);
        }
        return getJson("/api/v1/namespaces/" + encodePath(namespace) + "/configmaps", params);
    }

    public JsonNode listSecrets(String namespace, String labelSelector, int limit) throws IOException {
        Map<String, String> params = selectorParams(labelSelector, null, limit);
        if (namespace == null || namespace.isBlank() || "_all".equals(namespace)) {
            return getJson("/api/v1/secrets", params);
        }
        return getJson("/api/v1/namespaces/" + encodePath(namespace) + "/secrets", params);
    }

    public JsonNode listCrds(int limit) throws IOException {
        Map<String, String> params = new LinkedHashMap<>();
        if (limit > 0) {
            params.put("limit", String.valueOf(limit));
        }
        return getJson("/apis/apiextensions.k8s.io/v1/customresourcedefinitions", params);
    }

    public JsonNode applyPatchYaml(String resourcePath, String yamlBody) throws IOException {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("fieldManager", "datawise");
        params.put("force", "false");
        String path = resourcePath + buildQuery(params);
        return patchJson(path, "application/apply-patch+yaml", yamlBody);
    }

    public KubernetesConnectionConfig config() {
        return config;
    }

    private JsonNode getJson(String path) throws IOException {
        return getJson(path, Map.of());
    }

    private JsonNode getJson(String path, Map<String, String> queryParams) throws IOException {
        String body = getRaw(path, queryParams);
        if (body == null || body.isBlank()) {
            return MAPPER.createObjectNode();
        }
        return MAPPER.readTree(body);
    }

    private String getRaw(String path, Map<String, String> queryParams) throws IOException {
        return exchange("GET", path + buildQuery(queryParams), null, null);
    }

    private JsonNode patchJson(String path, String contentType, String body) throws IOException {
        String response = exchange("PATCH", path, contentType, body);
        if (response == null || response.isBlank()) {
            return MAPPER.createObjectNode();
        }
        return MAPPER.readTree(response);
    }

    private String exchange(String method, String path, String contentType, String body) throws IOException {
        HttpURLConnection connection = KubernetesTlsSupport.openConnection(
                config.resolve(path),
                config.insecureSkipTlsVerify(),
                TIMEOUT_MS
        );
        try {
            connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "application/json");
            if (config.bearerToken() != null && !config.bearerToken().isBlank()) {
                connection.setRequestProperty("Authorization", "Bearer " + config.bearerToken());
            }
            if (contentType != null && body != null) {
                connection.setRequestProperty("Content-Type", contentType);
                KubernetesTlsSupport.writeBody(connection, body);
            }
            int status = connection.getResponseCode();
            String responseBody = KubernetesTlsSupport.readBody(connection);
            if (status < 200 || status >= 300) {
                throw new IOException("Kubernetes API request failed (" + status + "): " + truncate(responseBody));
            }
            return responseBody;
        } finally {
            connection.disconnect();
        }
    }

    private static Map<String, String> selectorParams(String labelSelector, String fieldSelector, int limit) {
        Map<String, String> params = new LinkedHashMap<>();
        if (labelSelector != null && !labelSelector.isBlank()) {
            params.put("labelSelector", labelSelector.trim());
        }
        if (fieldSelector != null && !fieldSelector.isBlank()) {
            params.put("fieldSelector", fieldSelector.trim());
        }
        if (limit > 0) {
            params.put("limit", String.valueOf(limit));
        }
        return params;
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

    private static String truncate(String body) {
        if (body == null) {
            return "";
        }
        String trimmed = body.trim();
        return trimmed.length() <= 500 ? trimmed : trimmed.substring(0, 500) + "...";
    }

    static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        return value.asText(null);
    }

    static int intValue(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull() || !value.isNumber()) {
            return 0;
        }
        return value.asInt();
    }

    static boolean boolValue(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return !value.isMissingNode() && !value.isNull() && value.asBoolean(false);
    }
}
