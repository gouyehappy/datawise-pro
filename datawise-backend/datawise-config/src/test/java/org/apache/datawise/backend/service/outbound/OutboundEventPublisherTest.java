package org.apache.datawise.backend.service.outbound;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.FileOutboundWebhookStore;
import org.apache.datawise.backend.configstore.OutboundWebhookStore;
import org.apache.datawise.backend.domain.OutboundEvent;
import org.apache.datawise.backend.domain.OutboundEventType;
import org.apache.datawise.backend.model.OutboundWebhookEntity;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OutboundEventPublisherTest {

    @TempDir
    Path tempDir;

    private HttpServer server;
    private final AtomicInteger hits = new AtomicInteger();
    private OutboundEventPublisher publisher;
    private OutboundWebhookStore store;

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/hook", exchange -> {
            hits.incrementAndGet();
            byte[] body = "ok".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body);
            }
        });
        server.start();

        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        store = new FileOutboundWebhookStore(configDirectory, mapper);
        OutboundEventRegistry eventRegistry = new OutboundEventRegistry();
        OutboundChannelRendererRegistry rendererRegistry = new OutboundChannelRendererRegistry(List.of(
                new GenericWebhookRenderer(),
                new FeishuWebhookRenderer(),
                new DingtalkWebhookRenderer(),
                new EmailWebhookRenderer(),
                new IssueWebhookRenderer()));
        publisher = new OutboundEventPublisher(store, mapper, eventRegistry, rendererRegistry);
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void publishDeliversToMatchingWebhook() {
        int port = server.getAddress().getPort();
        OutboundWebhookEntity webhook = new OutboundWebhookEntity();
        webhook.setId("hook-1");
        webhook.setName("test");
        webhook.setEnabled(true);
        webhook.setUrl("http://127.0.0.1:" + port + "/hook");
        webhook.setEventTypes(List.of(OutboundEventType.SCHEDULED_TASK_FAILED));
        webhook.setTimeoutMs(3000);
        store.save("default", webhook);

        publisher.publishForTenant(
                "default",
                new OutboundEvent(
                        "evt-1",
                        OutboundEventType.SCHEDULED_TASK_FAILED,
                        Instant.now(),
                        "failed",
                        "boom",
                        Map.of("name", "t1")));

        assertTrue(hits.get() >= 1);
        assertEquals(true, store.findById("default", "hook-1").orElseThrow().getLastSuccessAt() != null);
    }

    @Test
    void publishDeliversFeishuChannelPayload() throws Exception {
        AtomicInteger feishuHits = new AtomicInteger();
        java.util.concurrent.atomic.AtomicReference<String> captured = new java.util.concurrent.atomic.AtomicReference<>();
        server.createContext("/feishu", exchange -> {
            feishuHits.incrementAndGet();
            captured.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = "{\"StatusCode\":0}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body);
            }
        });

        int port = server.getAddress().getPort();
        OutboundWebhookEntity webhook = new OutboundWebhookEntity();
        webhook.setId("hook-feishu");
        webhook.setName("feishu");
        webhook.setChannel("feishu");
        webhook.setEnabled(true);
        webhook.setUrl("http://127.0.0.1:" + port + "/feishu");
        webhook.setTimeoutMs(3000);
        store.save("default", webhook);

        publisher.publishForTenant(
                "default",
                new OutboundEvent(
                        "evt-f",
                        OutboundEventType.SCHEDULED_TASK_FAILED,
                        Instant.now(),
                        "failed",
                        "boom",
                        Map.of("name", "t1")));

        assertTrue(feishuHits.get() >= 1);
        assertTrue(captured.get().contains("msg_type"));
        assertTrue(captured.get().contains("text"));
    }
}
