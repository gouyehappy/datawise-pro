package org.apache.datawise.backend.connector.plugin;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConnectorPluginRemoteInstallSupportTest {

    @TempDir
    Path temp;

    @Test
    void downloadsAndVerifiesSha256() throws Exception {
        byte[] jarBytes = "fake-jar-bytes".getBytes(StandardCharsets.UTF_8);
        String digest = ConnectorPluginManifestSupport.sha256Hex(
                Files.write(temp.resolve("source.jar"), jarBytes));

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/oracle.jar", exchange -> {
            exchange.sendResponseHeaders(200, jarBytes.length);
            exchange.getResponseBody().write(jarBytes);
            exchange.close();
        });
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        try {
            Path plugins = temp.resolve("plugins");
            Path installed = ConnectorPluginRemoteInstallSupport.install(
                    "http://127.0.0.1:" + server.getAddress().getPort() + "/oracle.jar",
                    plugins,
                    "datawise-connector-oracle.jar",
                    digest,
                    HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());
            assertTrue(Files.isRegularFile(installed));
            assertEquals(digest, ConnectorPluginManifestSupport.sha256Hex(installed));
        } finally {
            server.stop(0);
        }
    }

    @Test
    void rejectsShaMismatch() throws Exception {
        byte[] jarBytes = "other".getBytes(StandardCharsets.UTF_8);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/bad.jar", exchange -> {
            exchange.sendResponseHeaders(200, jarBytes.length);
            exchange.getResponseBody().write(jarBytes);
            exchange.close();
        });
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        try {
            assertThrows(IllegalStateException.class, () -> ConnectorPluginRemoteInstallSupport.install(
                    "http://127.0.0.1:" + server.getAddress().getPort() + "/bad.jar",
                    temp.resolve("plugins"),
                    "datawise-connector-oracle.jar",
                    "deadbeef",
                    HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()));
        } finally {
            server.stop(0);
        }
    }

    @Test
    void sanitizesJarName() {
        assertThrows(IllegalArgumentException.class, () -> ConnectorPluginRemoteInstallSupport.sanitizeJarName("../evil.jar"));
        assertThrows(IllegalArgumentException.class, () -> ConnectorPluginRemoteInstallSupport.sanitizeJarName("not-a-jar"));
    }

    @Test
    void rejectsNonHttpsNonLoopbackWhenRequired() {
        assertThrows(IllegalArgumentException.class, () -> ConnectorPluginRemoteInstallSupport.validateDownloadUri(
                java.net.URI.create("http://evil.example/x.jar"),
                true,
                java.util.List.of()));
        ConnectorPluginRemoteInstallSupport.validateDownloadUri(
                java.net.URI.create("https://cdn.example/x.jar"),
                true,
                java.util.List.of());
        ConnectorPluginRemoteInstallSupport.validateDownloadUri(
                java.net.URI.create("http://127.0.0.1:9/x.jar"),
                true,
                java.util.List.of());
    }

    @Test
    void enforcesHostAllowlist() {
        assertThrows(IllegalArgumentException.class, () -> ConnectorPluginRemoteInstallSupport.validateDownloadUri(
                java.net.URI.create("https://evil.example/x.jar"),
                true,
                java.util.List.of("cdn.datawise.example")));
        ConnectorPluginRemoteInstallSupport.validateDownloadUri(
                java.net.URI.create("https://cdn.datawise.example/x.jar"),
                true,
                java.util.List.of("cdn.datawise.example"));
    }

    @Test
    void installsFromLocalMarketCacheWithoutDownload() throws Exception {
        byte[] jarBytes = "local-cache-jar".getBytes(StandardCharsets.UTF_8);
        Path configRoot = temp.resolve("config");
        Path plugins = configRoot.resolve("plugins");
        Path cache = configRoot.resolve("market-cache");
        Files.createDirectories(cache);
        Files.write(cache.resolve("datawise-connector-jenkins.jar"), jarBytes);

        Path installed = ConnectorPluginRemoteInstallSupport.install(
                null,
                plugins,
                "datawise-connector-jenkins.jar",
                null,
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());
        assertTrue(Files.isRegularFile(installed));
        assertEquals(
                new String(jarBytes, StandardCharsets.UTF_8),
                Files.readString(installed, StandardCharsets.UTF_8));
    }

    @Test
    void followsRedirectWhenLocationHostAllowed() throws Exception {
        byte[] jarBytes = "redirected-jar".getBytes(StandardCharsets.UTF_8);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        int port = server.getAddress().getPort();
        server.createContext("/start.jar", exchange -> {
            exchange.getResponseHeaders().add("Location", "http://127.0.0.1:" + port + "/final.jar");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        server.createContext("/final.jar", exchange -> {
            exchange.sendResponseHeaders(200, jarBytes.length);
            exchange.getResponseBody().write(jarBytes);
            exchange.close();
        });
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        try {
            Path plugins = temp.resolve("plugins-redirect");
            Path installed = ConnectorPluginRemoteInstallSupport.install(
                    "http://127.0.0.1:" + port + "/start.jar",
                    plugins,
                    "datawise-connector-oracle.jar",
                    null,
                    HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());
            assertTrue(Files.isRegularFile(installed));
            assertEquals(
                    new String(jarBytes, StandardCharsets.UTF_8),
                    Files.readString(installed, StandardCharsets.UTF_8));
        } finally {
            server.stop(0);
        }
    }
}
