package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.domain.ConnectionConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.nio.file.Path;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CommunityPluginHostConnectionTest {

    @TempDir
    Path temp;

    private final ObjectMapper mapper = new ObjectMapper();
    private ExecutorService executor;
    private CommunityPluginSidecarSession session;
    private CommunityPluginHost host;

    @BeforeEach
    void setUp() throws Exception {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(temp);
        CommunityPluginInstaller installer = new CommunityPluginInstaller(configDirectory, mapper, "4.1.6");
        host = new CommunityPluginHost(installer, configDirectory, mapper);

        PipedOutputStream pluginStdout = new PipedOutputStream();
        PipedInputStream hostStdout = new PipedInputStream(pluginStdout, 64 * 1024);
        PipedOutputStream hostStdin = new PipedOutputStream();
        PipedInputStream pluginStdin = new PipedInputStream(hostStdin, 64 * 1024);

        executor = Executors.newSingleThreadExecutor();
        executor.submit(() -> {
            try {
                new HelloCommunityPluginProtocol().run(pluginStdin, pluginStdout);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        session = CommunityPluginSidecarSession.attach(
                "io.datawise.example.hello",
                mapper,
                hostStdout,
                hostStdin,
                "4.1.6",
                temp.resolve("data")
        );
        host.putSession("io.datawise.example.hello", session);

        // Install a minimal plugin so contribution lookup succeeds.
        byte[] dwp = org.apache.datawise.backend.domain.communityplugin.DwpCodec.buildUnsigned(
                sampleManifest(),
                java.util.Map.of(
                        "bin/windows-x86_64/hello.bat", "@echo off\r\n".getBytes(java.nio.charset.StandardCharsets.UTF_8),
                        "ui/index.html", "<html>hi</html>".getBytes(java.nio.charset.StandardCharsets.UTF_8)
                ),
                mapper
        );
        installer.installBytes(dwp, org.apache.datawise.backend.domain.communityplugin.CommunityPluginInstallPolicy.DEVELOPMENT);
    }

    @AfterEach
    void tearDown() throws Exception {
        host.stopAll();
        if (executor != null) {
            executor.shutdownNow();
            executor.awaitTermination(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void testConnectAndListFilesystem() {
        ConnectionConfig config = new ConnectionConfig();
        config.setId("c1");
        config.setName("Hello");
        config.setDbType("plugin");
        config.setPluginId("io.datawise.example.hello");
        config.setPluginConnectionProvider("io.datawise.example.hello.connection");
        config.setHost("127.0.0.1");
        config.setPort("22");

        JsonNode test = host.testConnection(config);
        assertTrue(test.path("success").asBoolean());

        JsonNode connected = host.connect(config);
        assertTrue(connected.path("success").asBoolean());

        JsonNode listed = host.filesystemList(
                "io.datawise.example.hello",
                "io.datawise.example.hello.fs",
                "hello:/",
                50
        );
        assertTrue(listed.path("entries").isArray());
        assertTrue(listed.path("entries").size() >= 1);
        boolean hasReadme = false;
        for (JsonNode entry : listed.path("entries")) {
            if ("readme.txt".equals(entry.path("name").asText())) {
                hasReadme = true;
                break;
            }
        }
        assertTrue(hasReadme);
    }

    @Test
    void filesystemWriteRequiresCapability() {
        org.apache.datawise.backend.domain.communityplugin.CommunityPluginException ex =
                org.junit.jupiter.api.Assertions.assertThrows(
                        org.apache.datawise.backend.domain.communityplugin.CommunityPluginException.class,
                        () -> host.filesystemWrite(
                                "io.datawise.example.hello",
                                "io.datawise.example.hello.fs",
                                "hello:/notes.txt",
                                java.util.Base64.getEncoder().encodeToString("x".getBytes(java.nio.charset.StandardCharsets.UTF_8))
                        )
                );
        assertTrue(ex.getMessage().contains("write"));
    }

    @Test
    void connectionActionForwardsToSidecar() {
        ConnectionConfig config = new ConnectionConfig();
        config.setId("c1");
        config.setName("Hello");
        config.setDbType("plugin");
        config.setPluginId("io.datawise.example.hello");
        config.setPluginConnectionProvider("io.datawise.example.hello.connection");
        config.setHost("127.0.0.1");

        JsonNode result = host.connectionAction(config, "ping", mapper.createObjectNode().put("n", 1));
        assertTrue(result.path("success").asBoolean());
        assertEquals("ping", result.path("actionId").asText());
    }

    @Test
    void genericInvokeRejectsHostScheduledNamespaces() {
        // filesystem/* and connection/* are host-scheduled; the generic invoke
        // endpoint must not become a bypass around their capability checks.
        String[] blocked = {
                "filesystem/list",
                "filesystem/write",
                "connection/connect",
                "connection/test",
                "plugin/initialize"
        };
        for (String method : blocked) {
            org.apache.datawise.backend.domain.communityplugin.CommunityPluginException ex =
                    org.junit.jupiter.api.Assertions.assertThrows(
                            org.apache.datawise.backend.domain.communityplugin.CommunityPluginException.class,
                            () -> host.invoke("io.datawise.example.hello", method, mapper.createObjectNode())
                    );
            assertTrue(ex.getMessage().contains("host-scheduled"), method);
        }
        // UI-answered challenges stay forwardable through the generic endpoint.
        JsonNode ok = host.invoke(
                "io.datawise.example.hello",
                "connection/challenge/resolve",
                mapper.createObjectNode().put("challengeId", "ch1").put("operationId", "op1")
        );
        assertEquals("ch1", ok.path("resolved").asText());
    }

    @Test
    void workbenchCloseWhenAlreadyStoppedDoesNotRespawnSidecar() {
        host.stop("io.datawise.example.hello");
        JsonNode result = host.invoke(
                "io.datawise.example.hello",
                "workbench/close",
                mapper.createObjectNode().put("workbenchId", "wb-1")
        );
        assertEquals(0, result.path("sessionsRemaining").asInt(-1));
        assertTrue(result.path("ok").asBoolean());
        // Second close must stay a no-op (dispose + iframe unmount both call this).
        JsonNode again = host.invoke(
                "io.datawise.example.hello",
                "workbench/close",
                mapper.createObjectNode().put("workbenchId", "wb-1")
        );
        assertEquals(0, again.path("sessionsRemaining").asInt(-1));
    }

    @Test
    void workbenchCloseStopsSidecarWhenSessionsRemainingIsZero() throws Exception {
        host.stop("io.datawise.example.hello");

        PipedOutputStream pluginStdout = new PipedOutputStream();
        PipedInputStream hostStdout = new PipedInputStream(pluginStdout, 64 * 1024);
        PipedOutputStream hostStdin = new PipedOutputStream();
        PipedInputStream pluginStdin = new PipedInputStream(hostStdin, 64 * 1024);

        Future<?> plugin = executor.submit(() -> {
            try {
                new IdleCloseCommunityPluginProtocol().run(pluginStdin, pluginStdout);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        CommunityPluginSidecarSession idleSession = CommunityPluginSidecarSession.attach(
                "io.datawise.example.hello",
                mapper,
                hostStdout,
                hostStdin,
                "4.1.6",
                temp.resolve("data-idle")
        );
        host.putSession("io.datawise.example.hello", idleSession);

        JsonNode result = host.invoke(
                "io.datawise.example.hello",
                "workbench/close",
                mapper.createObjectNode().put("workbenchId", "wb-1")
        );
        assertEquals(0, result.path("sessionsRemaining").asInt(-1));

        // Sidecar removed — follow-up close must not activate a real process.
        JsonNode followUp = host.invoke(
                "io.datawise.example.hello",
                "workbench/close",
                mapper.createObjectNode().put("workbenchId", "wb-1")
        );
        assertEquals(0, followUp.path("sessionsRemaining").asInt(-1));
        assertTrue(followUp.path("ok").asBoolean());

        plugin.cancel(true);
    }

    @Test
    void secretClassificationFollowsManifestBindings() {
        ConnectionConfig config = new ConnectionConfig();
        config.setId("c1");
        config.setName("Hello");
        config.setDbType("plugin");
        config.setPluginId("io.datawise.example.hello");
        config.setPluginConnectionProvider("io.datawise.example.hello.connection");
        config.setHost("127.0.0.1");
        // "api_key_value" is secret-classified ONLY because the manifest binds it;
        // "password_policy_enabled" stays config despite containing "password".
        config.setAdvancedConfig("{\"api_key_value\":\"s3cret\",\"region\":\"eu\",\"password_policy_enabled\":true}");

        JsonNode result = host.testConnection(config);
        assertTrue(result.path("success").asBoolean());
        assertEquals("s3cret", result.path("secretsEcho").path("api_key_value").asText());
        assertEquals("eu", result.path("externalEcho").path("region").asText());
        assertTrue(result.path("externalEcho").path("password_policy_enabled").asBoolean());
        assertTrue(result.path("secretsEcho").path("region").isMissingNode());
        assertTrue(result.path("externalEcho").path("api_key_value").isMissingNode());
    }

    private static org.apache.datawise.backend.domain.communityplugin.CommunityPluginManifest sampleManifest() {
        return new org.apache.datawise.backend.domain.communityplugin.CommunityPluginManifest(
                1,
                "io.datawise.example.hello",
                "Hello Workbench",
                "1.0.0",
                "datawise-examples",
                null,
                "Hello",
                "Apache-2.0",
                null,
                null,
                java.util.List.of("example"),
                java.util.List.of("host.workbench", "host.filesystem"),
                new org.apache.datawise.backend.domain.communityplugin.CommunityPluginEngines(">=4.1.0", "^1.0"),
                new org.apache.datawise.backend.domain.communityplugin.CommunityPluginEntrypoints(
                        new org.apache.datawise.backend.domain.communityplugin.CommunityPluginBackendEntrypoint(
                                "bin/windows-x86_64/hello.bat", "stdio-jsonl"),
                        new org.apache.datawise.backend.domain.communityplugin.CommunityPluginUiEntrypoint("ui", "ui/index.html")
                ),
                java.util.List.of(
                        new org.apache.datawise.backend.domain.communityplugin.CommunityPluginContribution.ConnectionProvider(
                                null,
                                "io.datawise.example.hello.connection",
                                "Hello connection",
                                null,
                                null,
                        java.util.List.of("test", "connect"),
                        java.util.List.of(
                                new org.apache.datawise.backend.domain.communityplugin.CommunityPluginFormField(
                                        "api_key_value", "API key", "password", "secret",
                                        null, null, null, null, null, null, null, null),
                                new org.apache.datawise.backend.domain.communityplugin.CommunityPluginFormField(
                                        "password_policy_enabled", "Policy", "boolean", "config",
                                        null, null, null, null, null, null, null, null)
                        ),
                        java.util.List.of(),
                        "io.datawise.example.hello.workbench",
                        "io.datawise.example.hello.fs"
                ),
                        new org.apache.datawise.backend.domain.communityplugin.CommunityPluginContribution.Workbench(
                                null,
                                "io.datawise.example.hello.workbench",
                                "Hello workbench"
                        ),
                        new org.apache.datawise.backend.domain.communityplugin.CommunityPluginContribution.FilesystemProvider(
                                null,
                                "io.datawise.example.hello.fs",
                                "Hello files",
                                null,
                                java.util.List.of("hello"),
                                "hello:/",
                                java.util.List.of("read"),
                                null,
                                null
                        )
                ),
                null
        );
    }
}
