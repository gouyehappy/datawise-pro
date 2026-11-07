package org.apache.datawise.community.jenkins;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.awt.Desktop;
import java.io.IOException;
import java.io.InputStream;
import java.util.OptionalLong;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Jenkins Remote Access API client (community plugin sidecar). */
public final class JenkinsClient {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final String JOB_SUMMARY_FIELDS =
            "name,url,color,_class,fullName,buildable,"
                    + "lastBuild[number,result,building,timestamp,duration],"
                    + "lastSuccessfulBuild[number,timestamp],"
                    + "lastFailedBuild[number,timestamp]";

    private static final String JOBS_TREE =
            "jobs[" + JOB_SUMMARY_FIELDS + ",jobs[" + JOB_SUMMARY_FIELDS + ",jobs[" + JOB_SUMMARY_FIELDS + "]]]";

    private static final String JOBS_CHILDREN = "jobs[" + JOB_SUMMARY_FIELDS + "]";

    private final JenkinsConfig config;
    private final HttpClient httpClient;
    private final Duration timeout;

    public JenkinsClient(JenkinsConfig config) {
        this.config = config;
        this.timeout = Duration.ofSeconds(Math.max(5, config.connectTimeoutSecs()));
        CookieManager cookies = new CookieManager();
        cookies.setCookiePolicy(CookiePolicy.ACCEPT_ALL);
        HttpClient.Builder builder = HttpClient.newBuilder()
                .connectTimeout(timeout)
                .followRedirects(HttpClient.Redirect.NEVER)
                .cookieHandler(cookies);
        if (config.https() && config.insecureSkipTls()) {
            builder.sslContext(insecureSslContext());
        }
        this.httpClient = builder.build();
    }

    public InfoResponse info() throws IOException, InterruptedException {
        HttpResponse<String> response = send(
                HttpRequest.newBuilder(URI.create(config.baseUrl() + "/api/json"))
                        .timeout(timeout)
                        .GET()
        );
        requireOk(response);
        JsonNode root = MAPPER.readTree(bodyOrEmpty(response));
        String version = response.headers().firstValue("X-Jenkins").orElse(null);
        return new InfoResponse(root, version);
    }

    public JsonNode listJobsTree() throws IOException, InterruptedException {
        return getJson("/api/json?tree=" + enc(JOBS_TREE));
    }

    public JsonNode listJobChildren(String folderPath) throws IOException, InterruptedException {
        String tree = enc(JOBS_CHILDREN);
        if (folderPath == null || folderPath.isBlank()) {
            return getJson("/api/json?tree=" + tree);
        }
        return getJson(jobApiPath(folderPath) + "/api/json?tree=" + tree);
    }

    public JsonNode listViews() throws IOException, InterruptedException {
        return getJson("/api/json?tree=" + enc("views[name,url,description]"));
    }

    public JsonNode listJobsInView(String viewName) throws IOException, InterruptedException {
        return getJson(viewApiPath(viewName) + "/api/json?tree=" + enc(JOBS_TREE));
    }

    public JsonNode listJobChildrenInView(String viewName) throws IOException, InterruptedException {
        return getJson(viewApiPath(viewName) + "/api/json?tree=" + enc(JOBS_CHILDREN));
    }

    public JsonNode listQueue() throws IOException, InterruptedException {
        String tree = enc("items[id,blocked,buildable,inQueueSince,why,task[name,url,fullName]]");
        return getJson("/queue/api/json?tree=" + tree);
    }

    public JsonNode describeJob(String jobName) throws IOException, InterruptedException {
        String tree = enc(
                "name,fullName,url,color,description,buildable,inQueue,"
                        + "lastBuild[number,url,result,building,timestamp,duration,displayName],"
                        + "lastCompletedBuild[number,url,result,building,timestamp,duration,displayName],"
                        + "lastSuccessfulBuild[number,url,result,building,timestamp,duration,displayName],"
                        + "lastFailedBuild[number,url,result,building,timestamp,duration,displayName],"
                        + "builds[number,url,result,building,timestamp,duration,displayName]{0,20},"
                        + "property[_class,parameterDefinitions[name,type,description,_class,"
                        + "defaultParameterValue[value],choices]]"
        );
        return getJson(jobApiPath(jobName) + "/api/json?tree=" + tree);
    }

    public JsonNode describeBuild(String jobName, int buildNumber) throws IOException, InterruptedException {
        // Keep tree fields minimal — displayPath is optional and some older controllers reject it in tree=.
        String tree = enc(
                "number,url,result,building,timestamp,duration,displayName,"
                        + "artifacts[fileName,relativePath]"
        );
        return getJson(jobApiPath(jobName) + "/" + buildNumber + "/api/json?tree=" + tree);
    }

    public TriggerResponse triggerBuild(String jobName, Map<String, String> parameters)
            throws IOException, InterruptedException {
        requireWritable("trigger build");
        Crumb crumb = fetchCrumb();
        boolean hasParams = parameters != null && !parameters.isEmpty();
        String path = jobApiPath(jobName) + (hasParams ? "/buildWithParameters" : "/build");
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(config.baseUrl() + path))
                .timeout(timeout)
                .header("Accept", "application/json");
        applyCrumb(builder, crumb);
        if (hasParams) {
            builder.header("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
                    .POST(HttpRequest.BodyPublishers.ofString(toFormBody(parameters, crumb), StandardCharsets.UTF_8));
        } else if (crumb != Crumb.NONE) {
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
        return new TriggerResponse(response.headers().firstValue("Location").orElse(null));
    }

    public void stopBuild(String jobName, int buildNumber) throws IOException, InterruptedException {
        requireWritable("stop build");
        Crumb crumb = fetchCrumb();
        String path = jobApiPath(jobName) + "/" + buildNumber + "/stop";
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(config.baseUrl() + path))
                .timeout(timeout);
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

    public ProgressiveLog progressiveLog(String jobName, int buildNumber, int start)
            throws IOException, InterruptedException {
        int safeStart = Math.max(0, start);
        String jobPath = jobApiPath(jobName) + "/" + buildNumber;
        String progressivePath = jobPath + "/logText/progressiveText?start=" + safeStart;
        HttpResponse<String> response = send(logRequest(progressivePath));
        int status = response.statusCode();
        if (status == 404 || status == 405 || status == 501) {
            // Some proxies / older setups block progressiveText; fall back to full consoleText.
            if (safeStart > 0) {
                return new ProgressiveLog("", false, safeStart);
            }
            return consoleTextLog(jobPath);
        }
        requireOk(response);
        boolean more = "true".equalsIgnoreCase(response.headers().firstValue("X-More-Data").orElse("false"));
        int next = safeStart;
        try {
            next = Integer.parseInt(response.headers().firstValue("X-Text-Size").orElse(String.valueOf(safeStart)));
        } catch (NumberFormatException ignored) {
            // keep start
        }
        return new ProgressiveLog(response.body() != null ? response.body() : "", more, next);
    }

    private ProgressiveLog consoleTextLog(String jobBuildPath) throws IOException, InterruptedException {
        HttpResponse<String> response = send(logRequest(jobBuildPath + "/consoleText"));
        requireOk(response);
        String body = response.body() != null ? response.body() : "";
        // consoleText is the full log; treat as complete snapshot
        return new ProgressiveLog(body, false, body.length());
    }

    private HttpRequest.Builder logRequest(String path) {
        return HttpRequest.newBuilder(URI.create(config.baseUrl() + path))
                .timeout(timeout)
                .header("Accept", "text/plain,*/*")
                .GET();
    }

    public JsonNode listNodes() throws IOException, InterruptedException {
        String tree = enc(
                "computer[displayName,description,offline,temporarilyOffline,idle,numExecutors,"
                        + "busyExecutors,offlineCauseReason,assignedLabels[name]]"
        );
        return getJson("/computer/api/json?tree=" + tree);
    }

    public List<ArtifactInfo> listArtifacts(String jobName, int buildNumber)
            throws IOException, InterruptedException {
        JsonNode build = describeBuild(jobName, buildNumber);
        List<ArtifactInfo> out = new ArrayList<>();
        int probed = 0;
        for (JsonNode item : array(build, "artifacts")) {
            String fileName = text(item, "fileName");
            String relativePath = text(item, "relativePath");
            if (relativePath == null || relativePath.isBlank()) {
                continue;
            }
            Long size = null;
            // Soft size probe — cap to keep describe snappy on large artifact sets.
            if (probed < 16) {
                size = headArtifactSize(jobName, buildNumber, relativePath);
                probed += 1;
            }
            out.add(new ArtifactInfo(
                    fileName != null ? fileName : relativePath,
                    relativePath,
                    text(item, "displayPath"),
                    size
            ));
        }
        return out;
    }

    public Path downloadArtifact(String jobName, int buildNumber, String relativePath)
            throws IOException, InterruptedException {
        requireWritable("download artifact");
        if (relativePath == null || relativePath.isBlank()) {
            throw new IllegalArgumentException("relativePath is required");
        }
        String normalized = relativePath.replace('\\', '/');
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        if (normalized.contains("..")) {
            throw new IllegalArgumentException("invalid relativePath");
        }
        String url = config.baseUrl() + jobApiPath(jobName) + "/" + buildNumber + "/artifact/" + encodeArtifactPath(normalized);
        HttpResponse<InputStream> response = sendStream(
                HttpRequest.newBuilder(URI.create(url)).timeout(timeout).GET()
        );
        int status = response.statusCode();
        if (status < 200 || status >= 300) {
            throw new IOException("Artifact download failed (" + status + ")");
        }
        Path dir = config.downloadDir();
        Files.createDirectories(dir);
        String fileName = Path.of(normalized).getFileName().toString();
        Path target = uniquePath(dir.resolve(fileName));
        try (InputStream in = response.body()) {
            Files.copy(in, target);
        }
        return target.toAbsolutePath().normalize();
    }

    public Path downloadDir() {
        return config.downloadDir().toAbsolutePath().normalize();
    }

    /** Reveal a file/folder under the configured download directory in the OS file manager. */
    public void revealPath(String pathText) throws IOException {
        if (pathText == null || pathText.isBlank()) {
            throw new IllegalArgumentException("path is required");
        }
        Path path = Path.of(pathText).toAbsolutePath().normalize();
        Path root = downloadDir();
        if (!path.startsWith(root)) {
            throw new IllegalArgumentException("path is outside download directory");
        }
        if (!Files.exists(path)) {
            throw new IOException("path does not exist: " + path);
        }
        revealInFileManager(path);
    }

    private Long headArtifactSize(String jobName, int buildNumber, String relativePath) {
        try {
            String normalized = relativePath.replace('\\', '/');
            while (normalized.startsWith("/")) {
                normalized = normalized.substring(1);
            }
            if (normalized.contains("..")) {
                return null;
            }
            String url = config.baseUrl() + jobApiPath(jobName) + "/" + buildNumber
                    + "/artifact/" + encodeArtifactPath(normalized);
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(4))
                    .method("HEAD", HttpRequest.BodyPublishers.noBody());
            HttpResponse<Void> response = sendEmpty(builder);
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return null;
            }
            OptionalLong len = response.headers().firstValueAsLong("Content-Length");
            return len.isPresent() ? len.getAsLong() : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private HttpResponse<Void> sendEmpty(HttpRequest.Builder builder) throws IOException, InterruptedException {
        applyAuth(builder);
        try {
            return httpClient.send(builder.build(), HttpResponse.BodyHandlers.discarding());
        } catch (javax.net.ssl.SSLException ex) {
            throw new IOException(sslHint(ex), ex);
        }
    }

    private static void revealInFileManager(Path path) throws IOException {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        try {
            if (os.contains("win")) {
                new ProcessBuilder("explorer.exe", "/select,", path.toString()).start();
                return;
            }
            if (os.contains("mac")) {
                new ProcessBuilder("open", "-R", path.toString()).start();
                return;
            }
            Path dir = Files.isDirectory(path) ? path : path.getParent();
            if (dir != null && Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.OPEN)) {
                Desktop.getDesktop().open(dir.toFile());
                return;
            }
            if (dir != null) {
                new ProcessBuilder("xdg-open", dir.toString()).start();
            }
        } catch (Exception ex) {
            throw new IOException("Failed to reveal path: " + ex.getMessage(), ex);
        }
    }

    private void requireWritable(String action) throws IOException {
        if (config.readOnly()) {
            throw new IOException("Connection is read-only; cannot " + action + ".");
        }
    }

    private JsonNode getJson(String path) throws IOException, InterruptedException {
        HttpResponse<String> response = send(
                HttpRequest.newBuilder(URI.create(config.baseUrl() + path))
                        .timeout(timeout)
                        .header("Accept", "application/json")
                        .GET()
        );
        requireOk(response);
        return MAPPER.readTree(bodyOrEmpty(response));
    }

    private Crumb fetchCrumb() throws IOException, InterruptedException {
        HttpResponse<String> response = send(
                HttpRequest.newBuilder(URI.create(config.baseUrl() + "/crumbIssuer/api/json"))
                        .timeout(timeout)
                        .GET()
        );
        if (response.statusCode() == 404 || response.statusCode() < 200 || response.statusCode() >= 300) {
            return Crumb.NONE;
        }
        JsonNode root = MAPPER.readTree(bodyOrEmpty(response));
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
            return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        } catch (javax.net.ssl.SSLException ex) {
            throw new IOException(sslHint(ex), ex);
        }
    }

    private HttpResponse<InputStream> sendStream(HttpRequest.Builder builder)
            throws IOException, InterruptedException {
        applyAuth(builder);
        try {
            return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
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
                    + "Use username + API Token (not login password), ensure Job/Build permission, "
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
                    + "Switch protocol to HTTPS (and the real TLS port).";
        }
        if (config.https() && loc.toLowerCase(Locale.ROOT).startsWith("http://")) {
            return "Jenkins redirected HTTPS to HTTP (" + status + " → " + clip(loc) + "). "
                    + "Switch protocol to HTTP or fix the reverse proxy.";
        }
        return "Jenkins REST request redirected (" + status + ")"
                + (loc.isEmpty() ? "" : ": " + clip(loc));
    }

    private String sslHint(javax.net.ssl.SSLException ex) {
        String msg = ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName();
        String lower = msg.toLowerCase(Locale.ROOT);
        if (config.https() && (lower.contains("plaintext") || lower.contains("unrecognized ssl"))) {
            return "HTTPS was used but the server spoke plain HTTP. Switch protocol to HTTP. Details: " + msg;
        }
        return "TLS handshake failed while calling " + config.baseUrl()
                + ". Enable “Skip TLS certificate verification” for self-signed certs if appropriate. Details: " + msg;
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

    private static String encodePath(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String encodeArtifactPath(String relativePath) {
        StringBuilder sb = new StringBuilder();
        String[] parts = relativePath.split("/");
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) {
                sb.append('/');
            }
            sb.append(encodePath(parts[i]));
        }
        return sb.toString();
    }

    private static String enc(String tree) {
        return URLEncoder.encode(tree, StandardCharsets.UTF_8);
    }

    private static String bodyOrEmpty(HttpResponse<String> response) {
        return response.body() != null ? response.body() : "{}";
    }

    private static String clip(String body) {
        if (body == null) {
            return "";
        }
        String trimmed = body.trim();
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (lower.startsWith("<!doctype") || lower.startsWith("<html") || lower.contains("<head")) {
            return "Jenkins returned an HTML error page (check job/build URL, context path, and permissions)";
        }
        if (trimmed.length() <= 240) {
            return trimmed;
        }
        return trimmed.substring(0, 237) + "...";
    }

    private static Path uniquePath(Path target) {
        if (!Files.exists(target)) {
            return target;
        }
        String fileName = target.getFileName().toString();
        int dot = fileName.lastIndexOf('.');
        String base = dot > 0 ? fileName.substring(0, dot) : fileName;
        String ext = dot > 0 ? fileName.substring(dot) : "";
        Path parent = target.getParent();
        for (int i = 1; i < 10_000; i++) {
            Path candidate = parent.resolve(base + "-" + i + ext);
            if (!Files.exists(candidate)) {
                return candidate;
            }
        }
        return parent.resolve(base + "-" + System.currentTimeMillis() + ext);
    }

    private static SSLContext insecureSslContext() {
        try {
            TrustManager[] trustAll = new TrustManager[]{
                    new X509TrustManager() {
                        public void checkClientTrusted(X509Certificate[] chain, String authType) {
                        }

                        public void checkServerTrusted(X509Certificate[] chain, String authType) {
                        }

                        public X509Certificate[] getAcceptedIssuers() {
                            return new X509Certificate[0];
                        }
                    }
            };
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, trustAll, new SecureRandom());
            return ctx;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to create insecure SSL context", ex);
        }
    }

    /** Flatten nested jobs from a tree response into a list of summaries with fullName. */
    public static List<Map<String, Object>> flattenJobs(JsonNode root) {
        List<Map<String, Object>> out = new ArrayList<>();
        collectJobs(root.path("jobs"), "", out);
        return out;
    }

    private static void collectJobs(JsonNode jobs, String parent, List<Map<String, Object>> out) {
        if (jobs == null || !jobs.isArray()) {
            return;
        }
        for (JsonNode job : jobs) {
            Map<String, Object> row = summarizeJob(job, parent);
            out.add(row);
            String fullName = String.valueOf(row.getOrDefault("fullName", ""));
            if (isFolder(job)) {
                collectJobs(job.path("jobs"), fullName, out);
            }
        }
    }

    public static Map<String, Object> summarizeJob(JsonNode job, String parent) {
        Map<String, Object> row = new LinkedHashMap<>();
        String name = text(job, "name");
        String fullName = text(job, "fullName");
        if (fullName == null || fullName.isBlank()) {
            if (parent == null || parent.isBlank()) {
                fullName = name;
            } else {
                fullName = parent + "/" + name;
            }
        }
        row.put("name", name);
        row.put("fullName", fullName);
        row.put("url", text(job, "url"));
        row.put("color", text(job, "color"));
        row.put("className", text(job, "_class"));
        row.put("buildable", bool(job, "buildable"));
        row.put("folder", isFolder(job));
        JsonNode last = job.path("lastBuild");
        if (last.isObject()) {
            row.put("lastBuildNumber", intValue(last, "number"));
            row.put("lastBuildResult", text(last, "result"));
            row.put("lastBuildBuilding", bool(last, "building"));
            row.put("lastBuildTimestamp", last.path("timestamp").asLong(0));
            row.put("lastBuildDuration", last.path("duration").asLong(0));
        }
        JsonNode lastOk = job.path("lastSuccessfulBuild");
        if (lastOk.isObject()) {
            row.put("lastSuccessNumber", intValue(lastOk, "number"));
            row.put("lastSuccessTimestamp", lastOk.path("timestamp").asLong(0));
        }
        JsonNode lastFail = job.path("lastFailedBuild");
        if (lastFail.isObject()) {
            row.put("lastFailureNumber", intValue(lastFail, "number"));
            row.put("lastFailureTimestamp", lastFail.path("timestamp").asLong(0));
        }
        return row;
    }

    static boolean isFolder(JsonNode job) {
        String cls = text(job, "_class");
        if (cls != null && cls.toLowerCase(Locale.ROOT).contains("folder")) {
            return true;
        }
        return job.path("jobs").isArray();
    }

    public record InfoResponse(JsonNode root, String version) {
    }

    public record TriggerResponse(String queueUrl) {
    }

    public record ProgressiveLog(String text, boolean moreData, int nextStart) {
    }

    public record ArtifactInfo(String fileName, String relativePath, String displayPath, Long sizeBytes) {
    }

    private record Crumb(String field, String value) {
        static final Crumb NONE = new Crumb("", "");
    }
}
