package org.apache.datawise.desktop.staticserver;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.apache.datawise.desktop.bridge.HtmlBridgeInjector;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * Serves packaged Vue {@code dist/} over {@code http://127.0.0.1} so Monaco workers
 * are not blocked by {@code file://} restrictions (uses {@code app:} / localhost origin).
 *
 * <p>Also reverse-proxies {@code /api/**} to the Spring backend so community-plugin
 * workbench iframes can use same-origin relative URLs (host bridge needs same-origin
 * for {@code contentDocument} / bootstrap injection). Without this proxy, relative
 * {@code /api/.../ui/index.html} hits the SPA fallback and nests the whole app
 * inside the SSH Terminal tab.
 */
public final class RendererStaticServer implements AutoCloseable {
    private volatile String bridgeScript = "";
    private volatile String apiProxyBase = "";

    private static final Map<String, String> CONTENT_TYPES = Map.ofEntries(
            Map.entry(".html", "text/html; charset=utf-8"),
            Map.entry(".js", "text/javascript; charset=utf-8"),
            Map.entry(".mjs", "text/javascript; charset=utf-8"),
            Map.entry(".css", "text/css; charset=utf-8"),
            Map.entry(".json", "application/json; charset=utf-8"),
            Map.entry(".svg", "image/svg+xml"),
            Map.entry(".png", "image/png"),
            Map.entry(".ico", "image/x-icon"),
            Map.entry(".woff", "font/woff"),
            Map.entry(".woff2", "font/woff2"),
            Map.entry(".map", "application/json"),
            Map.entry(".wasm", "application/wasm")
    );

    private final Path distRoot;
    private HttpServer server;
    private int port;

    public RendererStaticServer(Path distRoot) {
        this.distRoot = distRoot.toAbsolutePath().normalize();
    }

    /** Optional early injection into {@code index.html} (before module scripts). */
    public void setBridgeScript(String bridgeScript) {
        this.bridgeScript = bridgeScript == null ? "" : bridgeScript;
    }

    /**
     * Backend origin for {@code /api/**} reverse proxy (no trailing slash),
     * e.g. {@code http://127.0.0.1:18423}. Empty disables proxying.
     */
    public void setApiProxyBase(String apiProxyBase) {
        if (apiProxyBase == null || apiProxyBase.isBlank()) {
            this.apiProxyBase = "";
            return;
        }
        this.apiProxyBase = apiProxyBase.trim().replaceAll("/+$", "");
    }

    public synchronized String start() throws IOException {
        return start(0);
    }

    /**
     * @param preferredPort preferred bind port; {@code 0} = ephemeral.
     *                      Packaged desktop should pass a stable port so the Chromium
     *                      origin (and thus localStorage) survives restarts.
     */
    public synchronized String start(int preferredPort) throws IOException {
        if (server != null) {
            return "http://127.0.0.1:" + port + "/";
        }
        if (!Files.isRegularFile(distRoot.resolve("index.html"))) {
            throw new IOException("frontend dist missing index.html under " + distRoot);
        }
        IOException lastError = null;
        int[] candidates = preferredPort > 0
                ? new int[]{preferredPort, 0}
                : new int[]{0};
        for (int candidate : candidates) {
            try {
                server = HttpServer.create(new InetSocketAddress("127.0.0.1", candidate), 0);
                port = server.getAddress().getPort();
                lastError = null;
                break;
            } catch (IOException e) {
                lastError = e;
                server = null;
            }
        }
        if (server == null) {
            throw lastError != null ? lastError : new IOException("failed to bind renderer static server");
        }
        server.createContext("/", this::handle);
        server.setExecutor(Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "datawise-renderer-static");
            t.setDaemon(true);
            return t;
        }));
        server.start();
        return "http://127.0.0.1:" + port + "/";
    }

    private void handle(HttpExchange exchange) throws IOException {
        try {
            String raw = exchange.getRequestURI().getPath();
            String path = raw == null || raw.isBlank() ? "/" : raw;
            if (shouldProxyApi(path)) {
                proxyApi(exchange, path);
                return;
            }
            String filePath = "/".equals(path) ? "/index.html" : path;
            Path resolved = distRoot.resolve(filePath.startsWith("/") ? filePath.substring(1) : filePath).normalize();
            if (!resolved.startsWith(distRoot) || !Files.isRegularFile(resolved)) {
                // SPA fallback
                resolved = distRoot.resolve("index.html");
            }
            byte[] body = Files.readAllBytes(resolved);
            String name = resolved.getFileName().toString().toLowerCase(Locale.ROOT);
            if (name.endsWith(".html")) {
                body = HtmlBridgeInjector.injectIntoHtml(body, bridgeScript);
            }
            Headers headers = exchange.getResponseHeaders();
            headers.set("Content-Type", contentType(resolved.getFileName().toString()));
            headers.set("Cache-Control", "no-cache");
            headers.set("Access-Control-Allow-Origin", "*");
            headers.set("Cross-Origin-Resource-Policy", "cross-origin");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        } catch (Exception e) {
            byte[] msg = ("Not found: " + e.getMessage()).getBytes();
            exchange.sendResponseHeaders(404, msg.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(msg);
            }
        }
    }

    private boolean shouldProxyApi(String path) {
        if (apiProxyBase == null || apiProxyBase.isBlank()) {
            return false;
        }
        return path.equals("/api") || path.startsWith("/api/");
    }

    private void proxyApi(HttpExchange exchange, String path) throws IOException {
        String query = exchange.getRequestURI().getRawQuery();
        String target = apiProxyBase + path + (query != null && !query.isBlank() ? "?" + query : "");
        HttpURLConnection conn = (HttpURLConnection) URI.create(target).toURL().openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setConnectTimeout(10_000);
        conn.setReadTimeout(120_000);
        conn.setRequestMethod(exchange.getRequestMethod());
        conn.setDoInput(true);

        // Forward request headers that UI ticket / session auth may need.
        Headers req = exchange.getRequestHeaders();
        for (Map.Entry<String, List<String>> entry : req.entrySet()) {
            String name = entry.getKey();
            if (name == null) {
                continue;
            }
            String lower = name.toLowerCase(Locale.ROOT);
            if (lower.equals("host")
                    || lower.equals("content-length")
                    || lower.equals("connection")
                    || lower.equals("transfer-encoding")) {
                continue;
            }
            for (String value : entry.getValue()) {
                conn.addRequestProperty(name, value);
            }
        }

        boolean hasBody = exchange.getRequestMethod() != null
                && !List.of("GET", "HEAD", "OPTIONS").contains(exchange.getRequestMethod().toUpperCase(Locale.ROOT));
        if (hasBody) {
            conn.setDoOutput(true);
            try (InputStream in = exchange.getRequestBody(); OutputStream out = conn.getOutputStream()) {
                in.transferTo(out);
            }
        }

        int status;
        InputStream upstream;
        try {
            status = conn.getResponseCode();
            upstream = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
        } catch (IOException e) {
            byte[] msg = ("Backend unavailable: " + e.getMessage()).getBytes();
            exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
            exchange.sendResponseHeaders(502, msg.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(msg);
            }
            return;
        }

        Headers resp = exchange.getResponseHeaders();
        Map<String, List<String>> upstreamHeaders = conn.getHeaderFields();
        if (upstreamHeaders != null) {
            for (Map.Entry<String, List<String>> entry : upstreamHeaders.entrySet()) {
                String name = entry.getKey();
                if (name == null) {
                    continue;
                }
                String lower = name.toLowerCase(Locale.ROOT);
                if (lower.equals("transfer-encoding")
                        || lower.equals("content-length")
                        || lower.equals("connection")) {
                    continue;
                }
                for (String value : entry.getValue()) {
                    resp.add(name, value);
                }
            }
        }

        byte[] body = upstream != null ? upstream.readAllBytes() : new byte[0];
        exchange.sendResponseHeaders(status, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        } finally {
            conn.disconnect();
        }
    }

    private static String contentType(String fileName) {
        int dot = fileName.lastIndexOf('.');
        if (dot < 0) {
            return "application/octet-stream";
        }
        return CONTENT_TYPES.getOrDefault(fileName.substring(dot).toLowerCase(Locale.ROOT), "application/octet-stream");
    }

    public int getPort() {
        return port;
    }

    @Override
    public synchronized void close() {
        if (server != null) {
            server.stop(0);
            server = null;
        }
    }
}
