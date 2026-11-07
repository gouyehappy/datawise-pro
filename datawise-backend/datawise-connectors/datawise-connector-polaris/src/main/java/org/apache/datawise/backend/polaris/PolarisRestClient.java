package org.apache.datawise.backend.polaris;

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
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Polaris naming / config API client. */
public final class PolarisRestClient {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Duration TIMEOUT = Duration.ofSeconds(20);
    /** Polaris OpenAPI success business code. */
    private static final int CODE_OK = 200000;
    private static final Pattern JWT_COOKIE = Pattern.compile("(?i)\\bjwt=([^;\\s]+)");

    private final PolarisConnectionConfig config;
    private final HttpClient httpClient;
    private String accessToken;
    private String userId;

    public PolarisRestClient(PolarisConnectionConfig config) {
        this.config = config;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        if (config.staticToken() != null && !config.staticToken().isBlank()) {
            this.accessToken = config.staticToken();
        }
    }

    public void ensureLogin() throws IOException, InterruptedException {
        if (accessToken != null && !accessToken.isBlank() && !isMaskedToken(accessToken)) {
            return;
        }
        if (!config.hasPasswordLogin()) {
            return;
        }
        ObjectNode body = MAPPER.createObjectNode();
        body.put("owner", config.owner() != null ? config.owner() : "polaris");
        body.put("name", config.username());
        body.put("password", config.password());

        HttpResponse<String> response = httpClient.send(
                HttpRequest.newBuilder(URI.create(config.baseUrl() + "/core/v1/user/login"))
                        .timeout(TIMEOUT)
                        .header("Content-Type", "application/json; charset=utf-8")
                        .header("Accept", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8))
                        .build(),
                HttpResponse.BodyHandlers.ofString()
        );
        JsonNode root = parseBody(response, "Polaris login");
        requireBusinessOk(root, "Polaris login");

        String token = firstText(root.path("loginResponse"), "token");
        if (token == null || token.isBlank() || isMaskedToken(token)) {
            token = null;
        }
        String uid = firstText(root.path("loginResponse"), "user_id", "userId", "id");

        // Some deployments mask loginResponse.token as ******; real token lives in jwt cookie claims.
        Optional<JwtClaims> claims = extractJwtClaims(response);
        if (claims.isPresent()) {
            if (token == null || token.isBlank()) {
                token = claims.get().token();
            }
            if (uid == null || uid.isBlank()) {
                uid = claims.get().userId();
            }
        }

        if (token == null || token.isBlank() || isMaskedToken(token)) {
            throw new IOException(
                    "Polaris login succeeded but token was missing/masked. "
                            + "Paste the user token from Polaris console into advanced config: token=..."
            );
        }
        this.accessToken = token;
        this.userId = uid;
    }

    public JsonNode listNamespaces() throws IOException, InterruptedException {
        return getJson("/naming/v1/namespaces");
    }

    public JsonNode listServices(String namespace, int limit) throws IOException, InterruptedException {
        StringBuilder path = new StringBuilder("/naming/v1/services?offset=0&limit=")
                .append(Math.max(1, limit));
        if (namespace != null && !namespace.isBlank()) {
            path.append("&namespace=").append(encode(namespace));
        }
        return getJson(path.toString());
    }

    public JsonNode listInstances(String namespace, String service, int limit)
            throws IOException, InterruptedException {
        StringBuilder path = new StringBuilder("/naming/v1/instances?offset=0&limit=")
                .append(Math.max(1, limit));
        if (namespace != null && !namespace.isBlank()) {
            path.append("&namespace=").append(encode(namespace));
        }
        if (service != null && !service.isBlank()) {
            path.append("&service=").append(encode(service));
        }
        return getJson(path.toString());
    }

    public JsonNode listConfigGroups(String namespace, int limit) throws IOException, InterruptedException {
        StringBuilder path = new StringBuilder("/config/v1/configfilegroups?offset=0&limit=")
                .append(Math.max(1, limit));
        if (namespace != null && !namespace.isBlank()) {
            path.append("&namespace=").append(encode(namespace));
        }
        return getJson(path.toString());
    }

    public JsonNode searchConfigFiles(String namespace, String group, String name, int limit)
            throws IOException, InterruptedException {
        StringBuilder path = new StringBuilder("/config/v1/configfiles/search?offset=0&limit=")
                .append(Math.max(1, limit));
        if (namespace != null && !namespace.isBlank()) {
            path.append("&namespace=").append(encode(namespace));
        }
        if (group != null && !group.isBlank()) {
            path.append("&group=").append(encode(group));
        }
        if (name != null && !name.isBlank()) {
            path.append("&name=").append(encode(name));
        }
        return getJson(path.toString());
    }

    public JsonNode getConfigFile(String namespace, String group, String name)
            throws IOException, InterruptedException {
        StringBuilder path = new StringBuilder("/config/v1/configfiles?");
        path.append("namespace=").append(encode(namespace != null ? namespace : ""));
        path.append("&group=").append(encode(group != null ? group : ""));
        path.append("&name=").append(encode(name != null ? name : ""));
        return getJson(path.toString());
    }

    /** Update config file content (draft). Clients typically need {@link #releaseConfigFile} afterwards. */
    public JsonNode updateConfigFile(
            String namespace,
            String group,
            String name,
            String content,
            String format
    ) throws IOException, InterruptedException {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("namespace", namespace != null ? namespace : "");
        body.put("group", group != null ? group : "");
        body.put("name", name != null ? name : "");
        body.put("content", content != null ? content : "");
        if (format != null && !format.isBlank()) {
            body.put("format", format);
        }
        return sendJson("PUT", "/config/v1/configfiles", body, "Polaris update config");
    }

    /**
     * Publish the latest config file version so clients receive it.
     * Body matches {@code v1.ConfigFileRelease}: {@code file_name} is the config file,
     * {@code name} is the release version label (not the file name).
     */
    public JsonNode releaseConfigFile(String namespace, String group, String name)
            throws IOException, InterruptedException {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("namespace", namespace != null ? namespace : "");
        body.put("group", group != null ? group : "");
        body.put("file_name", name != null ? name : "");
        // release version name — distinct from config file name
        body.put("name", "datawise-" + System.currentTimeMillis());
        body.put("comment", "Updated via DataWise");
        return sendJson("POST", "/config/v1/configfiles/release", body, "Polaris release config");
    }

    JsonNode getJson(String path) throws IOException, InterruptedException {
        ensureLogin();
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(config.baseUrl() + path))
                .timeout(TIMEOUT)
                .header("Accept", "application/json")
                .GET();
        applyAuthHeaders(builder);
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        JsonNode root = parseBody(response, "Polaris REST request");
        requireBusinessOk(root, "Polaris REST request");
        return root;
    }

    private JsonNode sendJson(String method, String path, ObjectNode body, String action)
            throws IOException, InterruptedException {
        ensureLogin();
        String payload = body != null ? body.toString() : "{}";
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(config.baseUrl() + path))
                .timeout(TIMEOUT)
                .header("Accept", "application/json")
                .header("Content-Type", "application/json; charset=utf-8");
        applyAuthHeaders(builder);
        if ("PUT".equalsIgnoreCase(method)) {
            builder.PUT(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8));
        } else if ("POST".equalsIgnoreCase(method)) {
            builder.POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8));
        } else {
            throw new IllegalArgumentException("Unsupported HTTP method: " + method);
        }
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        JsonNode root = parseBody(response, action);
        requireBusinessOk(root, action);
        return root;
    }

    private void applyAuthHeaders(HttpRequest.Builder builder) {
        if (accessToken != null && !accessToken.isBlank()) {
            builder.header("X-Polaris-Token", accessToken);
        }
        if (userId != null && !userId.isBlank()) {
            builder.header("X-Polaris-User", userId);
        }
    }

    private static JsonNode parseBody(HttpResponse<String> response, String action) throws IOException {
        String body = response.body() != null ? response.body() : "";
        int status = response.statusCode();
        JsonNode root;
        try {
            root = MAPPER.readTree(body.isBlank() ? "{}" : body);
        } catch (IOException ex) {
            if (status < 200 || status >= 300) {
                throw new IOException(action + " failed (" + status + "): " + clip(body), ex);
            }
            throw ex;
        }
        if (status < 200 || status >= 300) {
            String info = firstText(root, "info", "message");
            int code = intValue(root, "code");
            if (code == 407 || (info != null && info.toLowerCase(Locale.ROOT).contains("authentication"))) {
                throw new IOException(action + " failed: authentication required (Polaris code "
                        + code + "). Use username/password to login, or set advanced token=...");
            }
            throw new IOException(action + " failed (" + status + "): " + clip(body));
        }
        return root;
    }

    private static void requireBusinessOk(JsonNode root, String action) throws IOException {
        if (root == null || !root.has("code") || !root.path("code").isNumber()) {
            return;
        }
        int code = root.path("code").asInt();
        if (code == CODE_OK || code == 200 || code == 0) {
            return;
        }
        String info = firstText(root, "info", "message");
        if (code == 407) {
            throw new IOException(action + " failed: authentication required (Polaris code 407"
                    + (info != null ? ", " + info : "")
                    + "). Check username/password (owner defaults to polaris; override with owner= in advanced).");
        }
        throw new IOException(action + " failed (Polaris code " + code + ")"
                + (info != null ? ": " + info : ""));
    }

    private static Optional<JwtClaims> extractJwtClaims(HttpResponse<?> response) {
        List<String> cookies = response.headers().allValues("set-cookie");
        if (cookies == null || cookies.isEmpty()) {
            return Optional.empty();
        }
        for (String cookie : cookies) {
            if (cookie == null) {
                continue;
            }
            Matcher matcher = JWT_COOKIE.matcher(cookie);
            if (!matcher.find()) {
                continue;
            }
            String jwt = matcher.group(1);
            String[] parts = jwt.split("\\.");
            if (parts.length < 2) {
                continue;
            }
            try {
                String payloadJson = new String(Base64.getUrlDecoder().decode(padBase64(parts[1])), StandardCharsets.UTF_8);
                JsonNode payload = MAPPER.readTree(payloadJson);
                String token = firstText(payload, "Token", "token");
                String userId = firstText(payload, "UserID", "user_id", "userId", "uid");
                if ((token != null && !token.isBlank()) || (userId != null && !userId.isBlank())) {
                    return Optional.of(new JwtClaims(token, userId));
                }
            } catch (Exception ignored) {
                // try next cookie
            }
        }
        return Optional.empty();
    }

    private static String padBase64(String value) {
        int mod = value.length() % 4;
        if (mod == 0) {
            return value;
        }
        return value + "====".substring(mod);
    }

    private static boolean isMaskedToken(String token) {
        if (token == null || token.isBlank()) {
            return true;
        }
        String trimmed = token.trim();
        return trimmed.chars().allMatch(ch -> ch == '*');
    }

    static JsonNode unwrapData(JsonNode root) {
        if (root == null || root.isMissingNode() || root.isNull()) {
            return root;
        }
        if (root.has("data") && root.path("data").isObject()) {
            return root.path("data");
        }
        return root;
    }

    static List<JsonNode> array(JsonNode parent, String... fields) {
        if (parent == null || parent.isMissingNode() || parent.isNull()) {
            return List.of();
        }
        for (String field : fields) {
            JsonNode node = parent.path(field);
            if (node.isArray()) {
                List<JsonNode> items = new ArrayList<>();
                for (JsonNode item : node) {
                    items.add(item);
                }
                return items;
            }
        }
        return List.of();
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

    static boolean bool(JsonNode node, String field) {
        if (node == null) {
            return false;
        }
        JsonNode value = node.path(field);
        return value.isBoolean() && value.asBoolean();
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

    private record JwtClaims(String token, String userId) {
    }
}
