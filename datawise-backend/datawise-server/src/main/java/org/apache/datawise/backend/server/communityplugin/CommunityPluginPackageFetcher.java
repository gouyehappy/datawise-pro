package org.apache.datawise.backend.server.communityplugin;

import org.apache.datawise.backend.common.support.ConnectionProbeTargetPolicy;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.apache.datawise.backend.domain.communityplugin.DwpCodec;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;

/**
 * Loads a {@code .dwp} from HTTP(S) or classpath ({@code classpath:…}).
 * Remote fetches require HTTPS (loopback HTTP allowed for local tests) and reject private/link-local hosts.
 */
public final class CommunityPluginPackageFetcher {

    private static final Duration TIMEOUT = Duration.ofSeconds(30);
    private static final Set<String> LOOPBACK_HOSTS = Set.of("localhost", "127.0.0.1", "::1", "0:0:0:0:0:0:0:1");
    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(TIMEOUT)
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    private CommunityPluginPackageFetcher() {
    }

    public static byte[] fetch(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) {
            throw new CommunityPluginException("url is required");
        }
        String trimmed = rawUrl.trim();
        if (trimmed.regionMatches(true, 0, "classpath:", 0, "classpath:".length())) {
            return fetchClasspath(trimmed.substring("classpath:".length()).replaceFirst("^/+", ""));
        }
        return fetchHttp(trimmed);
    }

    public static URI requireHttpUrl(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new CommunityPluginException("url is required");
        }
        URI uri;
        try {
            uri = URI.create(raw.trim());
        } catch (IllegalArgumentException e) {
            throw new CommunityPluginException("Plugin package URL is invalid");
        }
        String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.ROOT) : "";
        String host = uri.getHost() != null ? uri.getHost().toLowerCase(Locale.ROOT) : "";
        boolean loopback = LOOPBACK_HOSTS.contains(host);
        if ("https".equals(scheme)) {
            // ok
        } else if ("http".equals(scheme) && loopback) {
            // local fixture / HttpServer tests only
        } else if ("http".equals(scheme)) {
            throw new CommunityPluginException("Plugin package URL must use https (http allowed only for loopback)");
        } else {
            throw new CommunityPluginException("Plugin package URL must use http or https");
        }
        if (uri.getUserInfo() != null && !uri.getUserInfo().isBlank()) {
            throw new CommunityPluginException("Plugin package URL must not include credentials");
        }
        if (host.isBlank()) {
            throw new CommunityPluginException("Plugin package URL is invalid");
        }
        try {
            ConnectionProbeTargetPolicy.requireAllowedProbeHost(host, "Plugin package URL host", false);
        } catch (IllegalArgumentException ex) {
            throw new CommunityPluginException(ex.getMessage(), ex);
        }
        return uri;
    }

    private static byte[] fetchClasspath(String path) {
        if (path == null || path.isBlank() || path.contains("..")) {
            throw new CommunityPluginException("Invalid classpath package path");
        }
        ClassPathResource resource = new ClassPathResource(path);
        if (!resource.exists()) {
            throw new CommunityPluginException("Classpath package not found: " + path);
        }
        try (InputStream in = resource.getInputStream()) {
            return readLimited(in, DwpCodec.MAX_PACKAGE_BYTES);
        } catch (CommunityPluginException e) {
            throw e;
        } catch (IOException e) {
            throw new CommunityPluginException("Failed to read classpath package: " + e.getMessage(), e);
        }
    }

    private static byte[] fetchHttp(String rawUrl) {
        URI uri = requireHttpUrl(rawUrl);
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(TIMEOUT)
                .GET()
                .build();
        try {
            HttpResponse<InputStream> response = CLIENT.send(request, HttpResponse.BodyHandlers.ofInputStream());
            int status = response.statusCode();
            if (status >= 300 && status < 400) {
                throw new CommunityPluginException(
                        "Plugin package download redirects are not followed (SSRF guard); HTTP " + status
                );
            }
            if (status < 200 || status >= 300) {
                throw new CommunityPluginException("Plugin package download failed: HTTP " + status);
            }
            try (InputStream in = response.body()) {
                return readLimited(in, DwpCodec.MAX_PACKAGE_BYTES);
            }
        } catch (CommunityPluginException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new CommunityPluginException("Plugin package download was interrupted", e);
        } catch (IOException e) {
            throw new CommunityPluginException("Plugin package download failed: " + e.getMessage(), e);
        }
    }

    static byte[] readLimited(InputStream in, long maxBytes) throws IOException {
        byte[] buffer = new byte[8192];
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        long total = 0;
        int read;
        while ((read = in.read(buffer)) >= 0) {
            total += read;
            if (total > maxBytes) {
                throw new CommunityPluginException("Plugin package exceeds " + maxBytes + " bytes");
            }
            out.write(buffer, 0, read);
        }
        if (total == 0) {
            throw new CommunityPluginException("Plugin package download was empty");
        }
        return out.toByteArray();
    }
}
