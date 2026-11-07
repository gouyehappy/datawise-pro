package org.apache.datawise.backend.jenkins;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Jenkins Remote Access API client. */
public final class JenkinsRestClient {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Duration TIMEOUT = Duration.ofSeconds(20);

    private final JenkinsConnectionConfig config;
    private final HttpClient httpClient;

    public JenkinsRestClient(JenkinsConnectionConfig config) {
        this.config = config;
        // Keep crumbIssuer session cookies for subsequent POSTs (Jenkins CSRF since 2.176+).
        CookieManager cookies = new CookieManager();
        cookies.setCookiePolicy(CookiePolicy.ACCEPT_ALL);
        // Do not auto-follow redirects: corporate proxies often 302 http→https on the same
        // plaintext port, which surfaces as SSLException "Unrecognized SSL message".
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                .followRedirects(HttpClient.Redirect.NEVER)
                .cookieHandler(cookies)
                .build();
    }

    public InfoResponse info() throws IOException, InterruptedException {
        HttpResponse<String> response = send(
                HttpRequest.newBuilder(URI.create(config.baseUrl() + "/api/json"))
                        .timeout(TIMEOUT)
                        .GET()
        );
        requireOk(response);
        JsonNode root = MAPPER.readTree(response.body() != null ? response.body() : "{}");
        String version = response.headers().firstValue("X-Jenkins").orElse(null);
        return new InfoResponse(root, version);
    }

    private static final String JOB_SUMMARY_FIELDS =
            "name,url,color,_class,fullName,buildable,"
                    + "lastBuild[number,result,building,timestamp,duration],"
                    + "lastSuccessfulBuild[number,timestamp],"
                    + "lastFailedBuild[number,timestamp]";

    private static final String JOBS_TREE =
            "jobs[" + JOB_SUMMARY_FIELDS + ",jobs[" + JOB_SUMMARY_FIELDS + ",jobs[" + JOB_SUMMARY_FIELDS + "]]]";

    private static final String JOBS_CHILDREN =
            "jobs[" + JOB_SUMMARY_FIELDS + "]";

    public JsonNode listJobsTree() throws IOException, InterruptedException {
        String tree = URLEncoder.encode(JOBS_TREE, StandardCharsets.UTF_8);
        return getJson("/api/json?tree=" + tree);
    }

    public JsonNode listJobChildren(String folderPath) throws IOException, InterruptedException {
        String tree = URLEncoder.encode(JOBS_CHILDREN, StandardCharsets.UTF_8);
        if (folderPath == null || folderPath.isBlank()) {
            return getJson("/api/json?tree=" + tree);
        }
        return getJson(jobApiPath(folderPath) + "/api/json?tree=" + tree);
    }

    public JsonNode listViews() throws IOException, InterruptedException {
        String tree = URLEncoder.encode("views[name,url]", StandardCharsets.UTF_8);
        return getJson("/api/json?tree=" + tree);
    }

    public JsonNode listJobsInView(String viewName) throws IOException, InterruptedException {
        String tree = URLEncoder.encode(JOBS_TREE, StandardCharsets.UTF_8);
        return getJson(viewApiPath(viewName) + "/api/json?tree=" + tree);
    }

    public JsonNode listJobChildrenInView(String viewName) throws IOException, InterruptedException {
        String tree = URLEncoder.encode(JOBS_CHILDREN, StandardCharsets.UTF_8);
        return getJson(viewApiPath(viewName) + "/api/json?tree=" + tree);
    }

    public JsonNode listQueue() throws IOException, InterruptedException {
        String tree = URLEncoder.encode(
                "items[id,blocked,buildable,inQueueSince,why,task[name,url,fullName]]",
                StandardCharsets.UTF_8
        );
        return getJson("/queue/api/json?tree=" + tree);
    }

    public JsonNode describeJob(String jobName) throws IOException, InterruptedException {
        String tree = URLEncoder.encode(
                "name,fullName,url,color,description,buildable,inQueue,"
                        + "lastBuild[number,url,result,building,timestamp,duration,displayName],"
                        + "lastCompletedBuild[number,url,result,building,timestamp,duration,displayName],"
                        + "lastSuccessfulBuild[number,url,result,building,timestamp,duration,displayName],"
                        + "lastFailedBuild[number,url,result,building,timestamp,duration,displayName],"
                        + "builds[number,url,result,building,timestamp,duration,displayName]{0,20},"
                        + "property[_class,parameterDefinitions[name,type,description,_class,"
                        + "defaultParameterValue[value],choices]]",
                StandardCharsets.UTF_8
        );
        return getJson(jobApiPath(jobName) + "/api/json?tree=" + tree);
    }

    public TriggerResponse triggerBuild(String jobName, Map<String, String> parameters)
            throws IOException, InterruptedException {
        Crumb crumb = fetchCrumb();
        boolean hasParams = parameters != null && !parameters.isEmpty();
        String path = jobApiPath(jobName) + (hasParams ? "/buildWithParameters" : "/build");
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(config.baseUrl() + path))
                .timeout(TIMEOUT)
                .header("Accept", "application/json");
        applyCrumb(builder, crumb);
        if (hasParams) {
            String form = toFormBody(parameters, crumb);
            builder.header("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
                    .POST(HttpRequest.BodyPublishers.ofString(form, StandardCharsets.UTF_8));
        } else if (crumb != Crumb.NONE) {
            // Some Jenkins setups accept crumb as a form field on empty POSTs.
            String form = URLEncoder.encode(crumb.field(), StandardCharsets.UTF_8)
                    + "="
                    + URLEncoder.encode(crumb.value(), StandardCharsets.UTF_8);
            builder.header("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
                    .POST(HttpRequest.BodyPublishers.ofString(form, StandardCharsets.UTF_8));
        } else {
            builder.POST(HttpRequest.BodyPublishers.noBody());
        }
        HttpResponse<String> response = send(builder);
        int status = response.statusCode();
        if (status != 201 && status != 200 && status != 302) {
            throw new IOException(mutationFailure("build trigger", status, response.body()));
        }
        String queueUrl = response.headers().firstValue("Location").orElse(null);
        return new TriggerResponse(queueUrl);
    }

    public void stopBuild(String jobName, int buildNumber) throws IOException, InterruptedException {
        Crumb crumb = fetchCrumb();
        String path = jobApiPath(jobName) + "/" + buildNumber + "/stop";
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(config.baseUrl() + path))
                .timeout(TIMEOUT);
        applyCrumb(builder, crumb);
        if (crumb != Crumb.NONE) {
            String form = URLEncoder.encode(crumb.field(), StandardCharsets.UTF_8)
                    + "="
                    + URLEncoder.encode(crumb.value(), StandardCharsets.UTF_8);
            builder.header("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
                    .POST(HttpRequest.BodyPublishers.ofString(form, StandardCharsets.UTF_8));
        } else {
            builder.POST(HttpRequest.BodyPublishers.noBody());
        }
        HttpResponse<String> response = send(builder);
        int status = response.statusCode();
        if (status < 200 || status >= 400) {
            throw new IOException(mutationFailure("stop build", status, response.body()));
        }
    }

    public String consoleText(String jobName, int buildNumber) throws IOException, InterruptedException {
        HttpResponse<String> response = send(
                HttpRequest.newBuilder(URI.create(
                                config.baseUrl() + jobApiPath(jobName) + "/" + buildNumber + "/consoleText"
                        ))
                        .timeout(TIMEOUT)
                        .GET()
        );
        requireOk(response);
        return response.body() != null ? response.body() : "";
    }

    public ProgressiveLog progressiveLog(String jobName, int buildNumber, int start)
            throws IOException, InterruptedException {
        String path = jobApiPath(jobName) + "/" + buildNumber + "/logText/progressiveText?start=" + Math.max(0, start);
        HttpResponse<String> response = send(
                HttpRequest.newBuilder(URI.create(config.baseUrl() + path))
                        .timeout(TIMEOUT)
                        .GET()
        );
        requireOk(response);
        boolean more = "true".equalsIgnoreCase(response.headers().firstValue("X-More-Data").orElse("false"));
        int next = start;
        try {
            next = Integer.parseInt(response.headers().firstValue("X-Text-Size").orElse(String.valueOf(start)));
        } catch (NumberFormatException ignored) {
            // keep start
        }
        return new ProgressiveLog(response.body() != null ? response.body() : "", more, next);
    }

    public JsonNode listNodes() throws IOException, InterruptedException {
        String tree = URLEncoder.encode(
                "computer[displayName,description,offline,temporarilyOffline,idle,numExecutors,"
                        + "busyExecutors,offlineCauseReason,assignedLabels[name]]",
                StandardCharsets.UTF_8
        );
        return getJson("/computer/api/json?tree=" + tree);
    }

    JsonNode getJson(String path) throws IOException, InterruptedException {
        HttpResponse<String> response = send(
                HttpRequest.newBuilder(URI.create(config.baseUrl() + path))
                        .timeout(TIMEOUT)
                        .header("Accept", "application/json")
                        .GET()
        );
        requireOk(response);
        return MAPPER.readTree(response.body() != null ? response.body() : "{}");
    }

    private Crumb fetchCrumb() throws IOException, InterruptedException {
        HttpResponse<String> response = send(
                HttpRequest.newBuilder(URI.create(config.baseUrl() + "/crumbIssuer/api/json"))
                        .timeout(TIMEOUT)
                        .GET()
        );
        if (response.statusCode() == 404) {
            return Crumb.NONE;
        }
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            // Some anonymous setups disable crumb issuer; allow POST without crumb.
            return Crumb.NONE;
        }
        JsonNode root = MAPPER.readTree(response.body() != null ? response.body() : "{}");
        String field = text(root, "crumbRequestField");
        String crumb = text(root, "crumb");
        if (field == null || field.isBlank() || crumb == null || crumb.isBlank()) {
            return Crumb.NONE;
        }
        return new Crumb(field, crumb);
    }

    private HttpResponse<String> send(HttpRequest.Builder builder) throws IOException, InterruptedException {
        applyAuth(builder);
        try {
            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            // 302 from /build is success (queue Location); callers decide how to treat status.
            return response;
        } catch (javax.net.ssl.SSLException ex) {
            throw new IOException(sslHint(ex), ex);
        }
    }

    private void requireOk(HttpResponse<String> response) throws IOException {
        int status = response.statusCode();
        if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
            String location = response.headers().firstValue("Location").orElse("");
            throw new IOException(redirectHint(status, location));
        }
        if (status < 200 || status >= 300) {
            throw new IOException("Jenkins REST request failed (" + status + "): " + clip(response.body()));
        }
    }

    private String mutationFailure(String action, int status, String body) {
        String clipped = clip(body);
        String lower = clipped.toLowerCase(Locale.ROOT);
        if (status == 403 && (lower.contains("crumb") || lower.contains("forbidden"))) {
            return "Jenkins " + action + " failed (403). "
                    + "Use username + API Token (not login password), ensure the user has Job/Build permission, "
                    + "and that CSRF crumb+session cookies are accepted. Details: " + clipped;
        }
        if (status == 401) {
            return "Jenkins " + action + " failed (401). Check username and API Token. Details: " + clipped;
        }
        return "Jenkins " + action + " failed (" + status + "): " + clipped;
    }

    private String redirectHint(int status, String location) {
        String loc = location != null ? location.trim() : "";
        boolean toHttps = loc.toLowerCase(Locale.ROOT).startsWith("https://");
        if (!config.https() && toHttps) {
            return "Jenkins redirected HTTP to HTTPS (" + status + " → " + clip(loc) + "). "
                    + "Set useHttps=true in advanced config (and the real TLS port), "
                    + "or point host/port at the plaintext listener without a cross-scheme redirect.";
        }
        if (config.https() && loc.toLowerCase(Locale.ROOT).startsWith("http://")) {
            return "Jenkins redirected HTTPS to HTTP (" + status + " → " + clip(loc) + "). "
                    + "Clear useHttps from advanced config or use the HTTP endpoint directly.";
        }
        return "Jenkins REST request redirected (" + status + ")"
                + (loc.isEmpty() ? "" : ": " + clip(loc))
                + ". Open that URL in a browser and set host/port/useHttps to match it.";
    }

    private String sslHint(javax.net.ssl.SSLException ex) {
        String msg = ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName();
        String lower = msg.toLowerCase(Locale.ROOT);
        if (config.https() && (lower.contains("plaintext") || lower.contains("unrecognized ssl"))) {
            return "HTTPS was used but the server spoke plain HTTP. "
                    + "Clear useHttps=true from advanced config (default is HTTP), "
                    + "or fix reverse-proxy TLS so it does not redirect to https on a plaintext port. "
                    + "Details: " + msg;
        }
        return "TLS handshake failed while calling " + config.baseUrl() + ". Details: " + msg;
    }

    private void applyAuth(HttpRequest.Builder builder) {
        if (config.authorizationHeader() != null) {
            builder.header("Authorization", config.authorizationHeader());
        }
    }

    private static void applyCrumb(HttpRequest.Builder builder, Crumb crumb) {
        if (crumb != null && crumb != Crumb.NONE) {
            builder.header(crumb.field(), crumb.value());
        }
    }

    private static String toFormBody(Map<String, String> parameters, Crumb crumb) {
        StringBuilder sb = new StringBuilder();
        boolean first = true;
        if (crumb != null && crumb != Crumb.NONE) {
            sb.append(URLEncoder.encode(crumb.field(), StandardCharsets.UTF_8))
                    .append('=')
                    .append(URLEncoder.encode(crumb.value(), StandardCharsets.UTF_8));
            first = false;
        }
        if (parameters != null) {
            for (Map.Entry<String, String> entry : parameters.entrySet()) {
                if (entry.getKey() == null || entry.getKey().isBlank()) {
                    continue;
                }
                if (!first) {
                    sb.append('&');
                }
                first = false;
                sb.append(URLEncoder.encode(entry.getKey().trim(), StandardCharsets.UTF_8))
                        .append('=')
                        .append(URLEncoder.encode(entry.getValue() != null ? entry.getValue() : "", StandardCharsets.UTF_8));
            }
        }
        return sb.toString();
    }

    static String jobApiPath(String jobName) {
        if (jobName == null || jobName.isBlank()) {
            throw new IllegalArgumentException("job name is required");
        }
        String normalized = jobName.trim().replace('\\', '/');
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        StringBuilder path = new StringBuilder();
        for (String part : normalized.split("/")) {
            if (part.isBlank()) {
                continue;
            }
            path.append("/job/").append(encodePath(part));
        }
        if (path.isEmpty()) {
            throw new IllegalArgumentException("job name is required");
        }
        return path.toString();
    }

    static String viewApiPath(String viewName) {
        if (viewName == null || viewName.isBlank()) {
            throw new IllegalArgumentException("view name is required");
        }
        return "/view/" + encodePath(viewName.trim());
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

    static boolean bool(JsonNode node, String field) {
        if (node == null) {
            return false;
        }
        JsonNode value = node.path(field);
        return value.isBoolean() && value.asBoolean();
    }

    static int intValue(JsonNode node, String field) {
        if (node == null) {
            return 0;
        }
        JsonNode value = node.path(field);
        return value.isNumber() ? value.asInt() : 0;
    }

    static long longValue(JsonNode node, String field) {
        if (node == null) {
            return 0L;
        }
        JsonNode value = node.path(field);
        return value.isNumber() ? value.asLong() : 0L;
    }

    private static String encodePath(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
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

    record InfoResponse(JsonNode root, String version) {
    }

    record TriggerResponse(String queueUrl) {
    }

    record ProgressiveLog(String text, boolean moreData, int nextStart) {
    }

    private record Crumb(String field, String value) {
        static final Crumb NONE = new Crumb("", "");
    }
}
