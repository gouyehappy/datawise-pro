package org.apache.datawise.backend.connector.plugin;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * Installs a connector plugin JAR into {@code config/plugins} from a local market-cache
 * or by downloading a manifest {@code downloadUrl}.
 */
public final class ConnectorPluginRemoteInstallSupport {

    public static final long MAX_JAR_BYTES = 120L * 1024L * 1024L;
    public static final String MARKET_CACHE_DIR = "market-cache";
    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);
    static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(45);
    private static final int MAX_REDIRECTS = 5;
    private static final Set<String> LOOPBACK_HOSTS = Set.of("127.0.0.1", "localhost", "::1", "[::1]");

    private ConnectorPluginRemoteInstallSupport() {
    }

    public static Path install(
                               String downloadUrl,
                               Path pluginsDir,
                               String jarName,
                               String expectedSha256) throws IOException {
        return install(downloadUrl, pluginsDir, jarName, expectedSha256, true, List.of());
    }

    public static Path install(
                               String downloadUrl,
                               Path pluginsDir,
                               String jarName,
                               String expectedSha256,
                               boolean requireHttps,
                               Collection<String> allowedHosts) throws IOException {
        return install(
                downloadUrl,
                pluginsDir,
                jarName,
                expectedSha256,
                requireHttps,
                allowedHosts,
                // Redirects are followed manually so each hop re-checks the host allowlist.
                HttpClient.newBuilder()
                        .connectTimeout(CONNECT_TIMEOUT)
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build());
    }

    static Path install(
                        String downloadUrl,
                        Path pluginsDir,
                        String jarName,
                        String expectedSha256,
                        HttpClient httpClient) throws IOException {
        // Tests use local HttpServer — allow loopback http when requireHttps is true.
        return install(downloadUrl, pluginsDir, jarName, expectedSha256, true, List.of(), httpClient);
    }

    static Path install(
                        String downloadUrl,
                        Path pluginsDir,
                        String jarName,
                        String expectedSha256,
                        boolean requireHttps,
                        Collection<String> allowedHosts,
                        HttpClient httpClient) throws IOException {
        if (pluginsDir == null) {
            throw new IllegalArgumentException("pluginsDir is required");
        }
        String safeJar = sanitizeJarName(jarName);
        Files.createDirectories(pluginsDir);
        Path target = pluginsDir.resolve(safeJar).normalize();
        if (!target.startsWith(pluginsDir.normalize())) {
            throw new IllegalArgumentException("Invalid jar path: " + safeJar);
        }

        Optional<Path> local = findLocalMarketJar(pluginsDir, safeJar);
        if (local.isPresent()) {
            return installFromLocalFile(local.get(), target, expectedSha256, safeJar);
        }

        if (downloadUrl == null || downloadUrl.isBlank()) {
            throw new IllegalArgumentException(
                    "downloadUrl is required (and no local market-cache JAR for " + safeJar + ")");
        }
        URI uri = URI.create(downloadUrl.trim());
        validateDownloadUri(uri, requireHttps, allowedHosts);
        Path temp = pluginsDir.resolve(safeJar + ".download.tmp");
        try {
            downloadTo(httpClient, uri, temp, requireHttps, allowedHosts);
            verifySha256(temp, expectedSha256, safeJar);
            return atomicReplace(temp, target);
        } catch (IOException | RuntimeException ex) {
            try {
                Files.deleteIfExists(temp);
            } catch (IOException ignored) {
                // best-effort cleanup
            }
            throw ex;
        }
    }

    /**
     * Looks under workspace {@code config/market-cache/<jar>}, {@code config/plugins/<jar>},
     * then packaged install {@code config-bundle/market-cache/<jar>}.
     */
    public static Optional<Path> findLocalMarketJar(Path pluginsDir, String jarName) {
        if (pluginsDir == null || jarName == null || jarName.isBlank()) {
            return Optional.empty();
        }
        String safeJar;
        try {
            safeJar = sanitizeJarName(jarName);
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
        List<Path> candidates = new ArrayList<>();
        Path parent = pluginsDir.getParent();
        if (parent != null) {
            candidates.add(parent.resolve(MARKET_CACHE_DIR).resolve(safeJar));
        }
        candidates.add(pluginsDir.resolve(safeJar));
        for (String rootRaw : new String[]{
                System.getProperty("datawise.install.root"),
                System.getenv("DATAWISE_INSTALL_ROOT"),
        }) {
            if (rootRaw == null || rootRaw.isBlank()) {
                continue;
            }
            Path install = Paths.get(rootRaw.trim());
            candidates.add(install.resolve("config-bundle").resolve(MARKET_CACHE_DIR).resolve(safeJar));
            candidates.add(install.resolve("resources").resolve("config-bundle").resolve(MARKET_CACHE_DIR).resolve(safeJar));
        }
        for (Path candidate : candidates) {
            if (candidate == null) {
                continue;
            }
            Path normalized = candidate.normalize();
            if (Files.isRegularFile(normalized)) {
                return Optional.of(normalized);
            }
        }
        return Optional.empty();
    }

    /** Visible for tests / callers before download. */
    public static void validateDownloadUri(URI uri, boolean requireHttps, Collection<String> allowedHosts) {
        if (uri == null) {
            throw new IllegalArgumentException("downloadUrl is required");
        }
        String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.ROOT) : "";
        String host = uri.getHost() != null ? uri.getHost().toLowerCase(Locale.ROOT) : "";
        boolean loopback = LOOPBACK_HOSTS.contains(host);
        if ("https".equals(scheme)) {
            // ok
        } else if ("http".equals(scheme) && (!requireHttps || loopback)) {
            // plain http only when policy allows, or loopback for local tests
        } else {
            throw new IllegalArgumentException(
                    requireHttps
                            ? "downloadUrl must be https (http allowed only for loopback): " + uri
                            : "downloadUrl must be http(s): " + uri);
        }
        if (allowedHosts != null && !allowedHosts.isEmpty()) {
            boolean matched = false;
            for (String allowed : allowedHosts) {
                if (allowed == null || allowed.isBlank()) {
                    continue;
                }
                if (host.equals(allowed.trim().toLowerCase(Locale.ROOT))) {
                    matched = true;
                    break;
                }
            }
            if (!matched && !loopback) {
                throw new IllegalArgumentException("downloadUrl host not in allowlist: " + host);
            }
        }
    }

    static String sanitizeJarName(String jarName) {
        if (jarName == null || jarName.isBlank()) {
            throw new IllegalArgumentException("jar name is required in manifest");
        }
        String name = jarName.trim();
        if (name.contains("/") || name.contains("\\") || name.contains("..")) {
            throw new IllegalArgumentException("jar name must be a plain file name: " + jarName);
        }
        if (!name.toLowerCase(Locale.ROOT).endsWith(".jar")) {
            throw new IllegalArgumentException("jar name must end with .jar: " + jarName);
        }
        return name;
    }

    private static Path installFromLocalFile(
                                             Path source,
                                             Path target,
                                             String expectedSha256,
                                             String safeJar) throws IOException {
        Path temp = target.resolveSibling(safeJar + ".local.tmp");
        try {
            Files.copy(source, temp, StandardCopyOption.REPLACE_EXISTING);
            verifySha256(temp, expectedSha256, safeJar);
            return atomicReplace(temp, target);
        } catch (IOException | RuntimeException ex) {
            try {
                Files.deleteIfExists(temp);
            } catch (IOException ignored) {
                // best-effort
            }
            throw ex;
        }
    }

    private static void verifySha256(Path file, String expectedSha256, String safeJar) throws IOException {
        if (expectedSha256 != null && !expectedSha256.isBlank()) {
            if (!ConnectorPluginManifestSupport.matchesSha256(file, expectedSha256)) {
                throw new IllegalStateException(
                        "JAR SHA-256 does not match manifest for " + safeJar);
            }
        }
    }

    private static Path atomicReplace(Path temp, Path target) throws IOException {
        try {
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ex) {
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return target;
    }

    private static void downloadTo(
                                   HttpClient httpClient,
                                   URI startUri,
                                   Path target,
                                   boolean requireHttps,
                                   Collection<String> allowedHosts) throws IOException {
        URI uri = startUri;
        try {
            for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
                HttpRequest request = HttpRequest.newBuilder(uri)
                        .timeout(REQUEST_TIMEOUT)
                        .header("User-Agent", "DataWise-ConnectorInstall/1.0")
                        .GET()
                        .build();
                HttpResponse<InputStream> response =
                        httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
                int status = response.statusCode();
                if (status >= 300 && status < 400) {
                    String location = response.headers().firstValue("location").orElse("").trim();
                    try {
                        response.body().close();
                    } catch (IOException ignored) {
                        // ignore
                    }
                    if (location.isEmpty()) {
                        throw new IllegalStateException(
                                "Download redirect missing Location (HTTP " + status + ") for " + uri);
                    }
                    if (hop == MAX_REDIRECTS) {
                        throw new IllegalStateException(
                                "Download exceeded max redirects (" + MAX_REDIRECTS + ") for " + startUri);
                    }
                    URI next = uri.resolve(location);
                    validateDownloadUri(next, requireHttps, allowedHosts);
                    uri = next;
                    continue;
                }
                if (status == 404) {
                    try {
                        response.body().close();
                    } catch (IOException ignored) {
                        // ignore
                    }
                    throw new IllegalStateException(
                            "Connector JAR not found (HTTP 404) at " + uri
                                    + ". Publish connector assets to the release, place the JAR under "
                                    + "config/" + MARKET_CACHE_DIR + "/, or import an offline package.");
                }
                if (status < 200 || status >= 300) {
                    try {
                        response.body().close();
                    } catch (IOException ignored) {
                        // ignore
                    }
                    throw new IllegalStateException("Download failed HTTP " + status + " for " + uri);
                }
                long written = 0L;
                try (InputStream in = response.body(); OutputStream out = Files.newOutputStream(target)) {
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = in.read(buffer)) >= 0) {
                        written += read;
                        if (written > MAX_JAR_BYTES) {
                            throw new IllegalStateException(
                                    "Download exceeds max size (" + MAX_JAR_BYTES + " bytes): " + uri);
                        }
                        out.write(buffer, 0, read);
                    }
                }
                if (written == 0L) {
                    throw new IllegalStateException("Downloaded empty JAR: " + uri);
                }
                return;
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IOException("Download interrupted: " + startUri, ex);
        } catch (java.net.http.HttpTimeoutException ex) {
            throw new IOException(
                    "Download timed out after " + REQUEST_TIMEOUT.toSeconds()
                            + "s for " + startUri
                            + ". Check network access to the download host, or place the JAR under config/"
                            + MARKET_CACHE_DIR + "/.",
                    ex);
        } catch (java.net.ConnectException ex) {
            throw new IOException(
                    "Cannot connect to download host for " + startUri
                            + ". Check network / proxy, or place the JAR under config/"
                            + MARKET_CACHE_DIR + "/.",
                    ex);
        }
        throw new IllegalStateException("Download failed for " + startUri);
    }
}
