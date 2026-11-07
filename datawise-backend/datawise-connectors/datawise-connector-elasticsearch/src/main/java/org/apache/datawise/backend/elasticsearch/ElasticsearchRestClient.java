package org.apache.datawise.backend.elasticsearch;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.Locale;
import java.util.Objects;

/** Minimal Elasticsearch HTTP client (direct or Kibana/OSD console proxy). */
public final class ElasticsearchRestClient {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Duration TIMEOUT = Duration.ofSeconds(30);
    private static final String KIBANA_PROXY_STATUS_HEADER = "x-console-proxy-status-code";

    private final ElasticsearchConnectionConfig config;
    private final HttpClient httpClient;

    public ElasticsearchRestClient(ElasticsearchConnectionConfig config) {
        this.config = Objects.requireNonNull(config, "config");
        HttpClient.Builder builder = HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                .followRedirects(HttpClient.Redirect.NORMAL);
        if (config.insecureSkipTlsVerify()) {
            builder.sslContext(insecureSslContext());
        }
        this.httpClient = builder.build();
    }

    public ElasticsearchConnectionConfig config() {
        return config;
    }

    public RestResponse probeConnectivity() throws IOException, InterruptedException {
        return request("GET", config.connectivityCheckPath(), null, null);
    }

    public RestResponse get(String path) throws IOException, InterruptedException {
        return request("GET", path, null, null);
    }

    public RestResponse request(String method, String path, String body, String contentType)
            throws IOException, InterruptedException {
        String normalizedMethod = method == null || method.isBlank() ? "GET" : method.trim().toUpperCase(Locale.ROOT);
        String normalizedPath = normalizePath(path);
        HttpRequest httpRequest = buildHttpRequest(normalizedMethod, normalizedPath, body, contentType);
        HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
        int status = resolveStatus(response);
        return new RestResponse(status, response.body() == null ? "" : response.body(), normalizedMethod, normalizedPath);
    }

    public JsonNode getJson(String path) throws IOException, InterruptedException {
        RestResponse response = get(path);
        if (response.status() < 200 || response.status() >= 300) {
            throw new IOException("Elasticsearch REST request failed (" + response.status() + "): " + response.body());
        }
        if (response.body().isBlank()) {
            return MAPPER.createObjectNode();
        }
        return MAPPER.readTree(response.body());
    }

    private HttpRequest buildHttpRequest(String method, String path, String body, String contentType) {
        HttpRequest.Builder builder;
        if (config.transportMode() == ElasticsearchConnectionConfig.TransportMode.KIBANA_PROXY) {
            String proxyUrl = config.clusterBaseUrl()
                    + config.kibanaBasePath()
                    + "/api/console/proxy?path="
                    + urlEncode(path)
                    + "&method="
                    + urlEncode(method);
            builder = HttpRequest.newBuilder()
                    .uri(URI.create(proxyUrl))
                    .timeout(TIMEOUT)
                    .header("kbn-xsrf", "true")
                    .header("osd-xsrf", "true")
                    .POST(bodyPublisher(body));
        } else {
            String url = config.clusterBaseUrl() + path;
            builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(TIMEOUT)
                    .method(method, bodyPublisher(body));
        }
        if (contentType != null && !contentType.isBlank()) {
            builder.header("Content-Type", contentType);
        } else if (body != null && !body.isBlank()) {
            builder.header("Content-Type", "application/json");
        }
        builder.header("Accept", "application/json");
        if (config.authorizationHeader() != null) {
            builder.header("Authorization", config.authorizationHeader());
        }
        return builder.build();
    }

    private static HttpRequest.BodyPublisher bodyPublisher(String body) {
        if (body == null || body.isEmpty()) {
            return HttpRequest.BodyPublishers.noBody();
        }
        return HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8);
    }

    private static int resolveStatus(HttpResponse<String> response) {
        String proxyStatus = response.headers().firstValue(KIBANA_PROXY_STATUS_HEADER).orElse(null);
        if (proxyStatus != null && !proxyStatus.isBlank()) {
            try {
                return Integer.parseInt(proxyStatus.trim());
            } catch (NumberFormatException ignored) {
                // fall through
            }
        }
        return response.statusCode();
    }

    static String normalizePath(String path) {
        if (path == null || path.isBlank()) {
            return "/";
        }
        String trimmed = path.trim();
        if (!trimmed.startsWith("/")) {
            trimmed = "/" + trimmed;
        }
        return trimmed;
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static SSLContext insecureSslContext() {
        try {
            TrustManager[] trustAll = new TrustManager[]{
                    new X509TrustManager() {
                        @Override
                        public void checkClientTrusted(X509Certificate[] chain, String authType) {
                        }

                        @Override
                        public void checkServerTrusted(X509Certificate[] chain, String authType) {
                        }

                        @Override
                        public X509Certificate[] getAcceptedIssuers() {
                            return new X509Certificate[0];
                        }
                    }
            };
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, trustAll, new SecureRandom());
            return context;
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to initialize insecure TLS context", ex);
        }
    }

    public record RestResponse(int status, String body, String method, String path) {
        public boolean isSuccessful() {
            return status >= 200 && status < 300;
        }
    }
}
