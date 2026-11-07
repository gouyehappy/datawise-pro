package org.apache.datawise.backend.server.communityplugin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginTransport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CommunityPluginFramedSidecarSessionTest {

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
    void framedInitializeInvokeAndBinaryEcho(@TempDir Path temp) throws Exception {
        PipedOutputStream pluginStdout = new PipedOutputStream();
        PipedInputStream hostStdout = new PipedInputStream(pluginStdout, 256 * 1024);
        PipedOutputStream hostStdin = new PipedOutputStream();
        PipedInputStream pluginStdin = new PipedInputStream(hostStdin, 256 * 1024);

        executor = Executors.newSingleThreadExecutor();
        Future<?> pluginFuture = executor.submit(() -> {
            try {
                new FramedEchoCommunityPluginProtocol().run(pluginStdin, pluginStdout);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        CountDownLatch eventLatch = new CountDownLatch(1);
        AtomicReference<String> eventMethod = new AtomicReference<>();
        CountDownLatch binaryLatch = new CountDownLatch(1);
        AtomicReference<byte[]> echoed = new AtomicReference<>();

        session = CommunityPluginSidecarSession.attach(
                "io.datawise.test.framed-echo",
                mapper,
                hostStdout,
                hostStdin,
                "4.1.6",
                temp.resolve("data"),
                CommunityPluginTransport.STDIO_FRAMED
        );
        session.addEventListener(message -> {
            eventMethod.set(message.path("method").asText());
            eventLatch.countDown();
        });
        session.addBinaryListener((channel, data) -> {
            if ("pty/in".equals(channel)) {
                echoed.set(data);
                binaryLatch.countDown();
            }
        });

        JsonNode pong = session.invoke("echo/ping", mapper.createObjectNode().put("message", "hi"));
        assertTrue(pong.path("pong").asBoolean());
        assertEquals("hi", pong.path("message").asText());

        assertTrue(eventLatch.await(3, TimeUnit.SECONDS));
        assertEquals("echo/ready", eventMethod.get());

        byte[] payload = "ls -la".getBytes(StandardCharsets.UTF_8);
        session.sendBinary("pty/in", payload);
        assertTrue(binaryLatch.await(3, TimeUnit.SECONDS));
        assertArrayEquals(payload, echoed.get());

        session.close();
        hostStdin.close();
        pluginFuture.get(3, TimeUnit.SECONDS);
    }
}
