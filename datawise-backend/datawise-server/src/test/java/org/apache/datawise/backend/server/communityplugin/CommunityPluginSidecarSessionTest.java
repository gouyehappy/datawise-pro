package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CommunityPluginSidecarSessionTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private ExecutorService executor;
    private CommunityPluginSidecarSession session;

    @AfterEach
    void tearDown() throws Exception {
        if (session != null) {
            session.close();
        }
        if (executor != null) {
            executor.shutdownNow();
            executor.awaitTermination(2, TimeUnit.SECONDS);
        }
    }

    @Test
    void initializeAndInvokeHelloOverPipes(@TempDir Path temp) throws Exception {
        PipedOutputStream pluginStdout = new PipedOutputStream();
        PipedInputStream hostStdout = new PipedInputStream(pluginStdout, 64 * 1024);
        PipedOutputStream hostStdin = new PipedOutputStream();
        PipedInputStream pluginStdin = new PipedInputStream(hostStdin, 64 * 1024);

        executor = Executors.newSingleThreadExecutor();
        Future<?> pluginFuture = executor.submit(() -> {
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

        JsonNode greet = session.invoke("hello/greet", mapper.createObjectNode());
        assertEquals("Hello from community plugin", greet.path("message").asText());

        JsonNode listed = session.invoke("filesystem/list", mapper.createObjectNode()
                .put("providerId", "io.datawise.example.hello.fs"));
        assertTrue(listed.path("entries").isArray());
        // Map iteration order is unspecified — assert membership, not position.
        boolean hasReadme = false;
        for (JsonNode entry : listed.path("entries")) {
            if ("readme.txt".equals(entry.path("name").asText())) {
                hasReadme = true;
                break;
            }
        }
        assertTrue(hasReadme, "expected readme.txt in listing: " + listed);

        session.close();
        hostStdin.close();
        pluginFuture.get(3, TimeUnit.SECONDS);
    }

    @Test
    void resolveJavaExecutableUsesHostJavaHomeNotProcessCommand() {
        String resolved = CommunityPluginSidecarSession.resolveJavaExecutable();
        boolean win = System.getProperty("os.name", "").toLowerCase().contains("win");
        Path expected = Path.of(System.getProperty("java.home"), "bin", win ? "java.exe" : "java")
                .toAbsolutePath();
        assertTrue(Files.isRegularFile(expected), "expected host java at " + expected);
        assertEquals(expected.toString(), resolved);
        // Guard against regressing to jpackage launcher (DataWiseCLI.exe -jar …).
        assertFalse(resolved.toLowerCase().endsWith("datawisecli.exe"));
    }
}
