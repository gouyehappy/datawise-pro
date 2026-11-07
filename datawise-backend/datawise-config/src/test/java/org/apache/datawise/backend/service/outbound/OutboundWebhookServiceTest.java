package org.apache.datawise.backend.service.outbound;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.FileOutboundWebhookStore;
import org.apache.datawise.backend.configstore.FileTenantStore;
import org.apache.datawise.backend.configstore.FileUserStore;
import org.apache.datawise.backend.configstore.OutboundWebhookStore;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.domain.OutboundEventType;
import org.apache.datawise.backend.domain.SaveOutboundWebhookRequest;
import org.apache.datawise.backend.domain.SaveOutboundWebhookResultDto;
import org.apache.datawise.backend.domain.SaveOutboundWebhookSubscriptionRequest;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OutboundWebhookServiceTest {

    @TempDir
    Path tempDir;

    private HttpServer server;
    private final AtomicInteger hits = new AtomicInteger();
    private OutboundWebhookService service;

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
        OutboundWebhookStore webhookStore = new FileOutboundWebhookStore(configDirectory, mapper);
        OutboundEventRegistry eventRegistry = new OutboundEventRegistry();
        OutboundChannelRendererRegistry rendererRegistry = new OutboundChannelRendererRegistry(List.of(
                new GenericWebhookRenderer(),
                new FeishuWebhookRenderer(),
                new DingtalkWebhookRenderer(),
                new EmailWebhookRenderer(),
                new IssueWebhookRenderer()));
        OutboundEventPublisher publisher = new OutboundEventPublisher(webhookStore, mapper, eventRegistry, rendererRegistry);

        UserStore userStore = new FileUserStore(configDirectory, mapper);
        TenantStore tenantStore = new FileTenantStore(configDirectory, mapper);
        userStore.saveUser(user("admin", 1L));

        UserAdminPolicy adminPolicy = new UserAdminPolicy(
                userStore,
                new UserAccessPolicy(),
                tenantStore,
                new TenancyProperties());
        service = new OutboundWebhookService(webhookStore, publisher, eventRegistry, new UserAccessPolicy(), adminPolicy);

        UserContext.set(1L, false, "session-admin");
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void saveAutoConfirmsGenericWebhook() {
        int port = server.getAddress().getPort();
        SaveOutboundWebhookResultDto result = service.save(new SaveOutboundWebhookRequest(
                null,
                "ops-webhook",
                true,
                "webhook",
                "http://127.0.0.1:" + port + "/hook",
                null,
                List.of(),
                List.of(),
                5000,
                false,
                null,
                null,
                null,
                null));

        assertEquals("ops-webhook", result.webhook().name());
        assertTrue(result.confirmationAttempted());
        assertFalse(result.confirmationSkipped());
        assertNotNull(result.confirmationResult());
        assertTrue(result.confirmationResult().ok());
        assertTrue(hits.get() >= 1);
    }

    @Test
    void saveAutoConfirmsEvenWhenOutboundTestNotSubscribed() {
        int port = server.getAddress().getPort();
        SaveOutboundWebhookResultDto result = service.save(new SaveOutboundWebhookRequest(
                null,
                "ops-webhook",
                true,
                "webhook",
                "http://127.0.0.1:" + port + "/hook",
                null,
                List.of(OutboundEventType.CONNECTION_HEALTH_FAILED),
                List.of(new SaveOutboundWebhookSubscriptionRequest(
                        OutboundEventType.CONNECTION_HEALTH_FAILED,
                        true,
                        null,
                        null,
                        null,
                        null,
                        null)),
                5000,
                false,
                null,
                null,
                null,
                null));

        assertTrue(result.confirmationAttempted());
        assertNotNull(result.confirmationResult());
        assertTrue(result.confirmationResult().ok(), result.confirmationResult().message());
        assertTrue(hits.get() >= 1);
    }

    @Test
    void saveSkipsAutoConfirmForIssueChannels() {
        SaveOutboundWebhookResultDto result = service.save(new SaveOutboundWebhookRequest(
                null,
                "jira-webhook",
                true,
                "jira_issue",
                "https://example.atlassian.net/rest/api/3/issue?project=DW",
                "token",
                List.of(),
                List.of(),
                5000,
                false,
                null,
                null,
                null,
                null));

        assertEquals("jira_issue", result.webhook().channel());
        assertFalse(result.confirmationAttempted());
        assertTrue(result.confirmationSkipped());
        assertEquals(0, hits.get());
    }

    private static UserEntity user(String username, long id) {
        UserEntity entity = new UserEntity();
        entity.setId(id);
        entity.setUsername(username);
        entity.setDisplayName(username);
        entity.setEmail(username + "@datawise.local");
        entity.setGuest(false);
        entity.setPasswordHash("test-hash");
        return entity;
    }
}
