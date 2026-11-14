package org.apache.datawise.backend.service.portability;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;

/**
 * Minimal WebDAV client for config sync packages (PUT / GET / PROPFIND-or-HEAD probe).
 */
public final class WebDavConfigSyncClient {

    private final HttpClient httpClient;

    public WebDavConfigSyncClient() {
        this(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build());
    }

    public WebDavConfigSyncClient(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public void test(String baseUrl, String username, String password, String remotePath)
            throws IOException, InterruptedException {
        URI target = resolveTarget(baseUrl, remotePath);
        HttpRequest request = HttpRequest.newBuilder(target)
                .timeout(Duration.ofSeconds(30))
                .header("Authorization", basicAuth(username, password))
                .method("PROPFIND", HttpRequest.BodyPublishers.noBody())
                .header("Depth", "0")
                .build();
        HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
        int code = response.statusCode();
        // Some servers reject PROPFIND on missing files but accept HEAD / GET parent.
        if (code == 404 || code == 405 || code == 501) {
            HttpRequest head = HttpRequest.newBuilder(target)
                    .timeout(Duration.ofSeconds(30))
                    .header("Authorization", basicAuth(username, password))
                    .method("HEAD", HttpRequest.BodyPublishers.noBody())
                    .build();
            HttpResponse<Void> headResponse = httpClient.send(head, HttpResponse.BodyHandlers.discarding());
            code = headResponse.statusCode();
            if (code == 404 || code == 405) {
                // Reachable auth: treat as OK when the remote file does not exist yet.
                URI parent = parentUri(target);
                if (parent != null) {
                    HttpRequest parentProbe = HttpRequest.newBuilder(parent)
                            .timeout(Duration.ofSeconds(30))
                            .header("Authorization", basicAuth(username, password))
                            .method("PROPFIND", HttpRequest.BodyPublishers.noBody())
                            .header("Depth", "0")
                            .build();
                    HttpResponse<Void> parentResponse =
                            httpClient.send(parentProbe, HttpResponse.BodyHandlers.discarding());
                    code = parentResponse.statusCode();
                    if (code == 404 || code == 405) {
                        HttpRequest parentHead = HttpRequest.newBuilder(parent)
                                .timeout(Duration.ofSeconds(30))
                                .header("Authorization", basicAuth(username, password))
                                .GET()
                                .build();
                        code = httpClient.send(parentHead, HttpResponse.BodyHandlers.discarding()).statusCode();
                    }
                }
            }
        }
        if (code >= 200 && code < 300) {
            return;
        }
        if (code == 401 || code == 403) {
            throw new IllegalArgumentException("WEBDAV_AUTH_FAILED");
        }
        throw new IllegalArgumentException("WEBDAV_TEST_FAILED:" + code);
    }

    public void upload(
                       String baseUrl,
                       String username,
                       String password,
                       String remotePath,
                       byte[] body) throws IOException, InterruptedException {
        if (body == null || body.length == 0) {
            throw new IllegalArgumentException("PACKAGE_REQUIRED");
        }
        URI target = resolveTarget(baseUrl, remotePath);
        HttpRequest request = HttpRequest.newBuilder(target)
                .timeout(Duration.ofSeconds(120))
                .header("Authorization", basicAuth(username, password))
                .header("Content-Type", "application/octet-stream")
                .PUT(HttpRequest.BodyPublishers.ofByteArray(body))
                .build();
        HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
        int code = response.statusCode();
        if (code >= 200 && code < 300) {
            return;
        }
        if (code == 401 || code == 403) {
            throw new IllegalArgumentException("WEBDAV_AUTH_FAILED");
        }
        throw new IllegalArgumentException("WEBDAV_UPLOAD_FAILED:" + code);
    }

    public byte[] download(String baseUrl, String username, String password, String remotePath)
            throws IOException, InterruptedException {
        URI target = resolveTarget(baseUrl, remotePath);
        HttpRequest request = HttpRequest.newBuilder(target)
                .timeout(Duration.ofSeconds(120))
                .header("Authorization", basicAuth(username, password))
                .GET()
                .build();
        HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
        int code = response.statusCode();
        if (code >= 200 && code < 300) {
            return response.body() != null ? response.body() : new byte[0];
        }
        if (code == 404) {
            throw new IllegalArgumentException("WEBDAV_NOT_FOUND");
        }
        if (code == 401 || code == 403) {
            throw new IllegalArgumentException("WEBDAV_AUTH_FAILED");
        }
        throw new IllegalArgumentException("WEBDAV_DOWNLOAD_FAILED:" + code);
    }

    static URI resolveTarget(String baseUrl, String remotePath) {
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new IllegalArgumentException("WEBDAV_URL_REQUIRED");
        }
        String base = baseUrl.trim();
        if (!base.endsWith("/")) {
            base = base + "/";
        }
        String path = remotePath == null || remotePath.isBlank()
                ? "datawise/profile-sync.dwprofile"
                : remotePath.trim().replace('\\', '/');
        while (path.startsWith("/")) {
            path = path.substring(1);
        }
        return URI.create(base).resolve(path);
    }

    private static URI parentUri(URI target) {
        String path = target.getPath();
        if (path == null || path.isBlank() || "/".equals(path)) {
            return null;
        }
        int slash = path.lastIndexOf('/');
        if (slash <= 0) {
            return target.resolve(".");
        }
        String parentPath = path.substring(0, slash + 1);
        return URI.create(target.getScheme() + "://" + target.getRawAuthority() + parentPath);
    }

    private static String basicAuth(String username, String password) {
        String user = username != null ? username : "";
        String pass = password != null ? password : "";
        String token = Base64.getEncoder().encodeToString((user + ":" + pass).getBytes(StandardCharsets.UTF_8));
        return "Basic " + token;
    }
}
