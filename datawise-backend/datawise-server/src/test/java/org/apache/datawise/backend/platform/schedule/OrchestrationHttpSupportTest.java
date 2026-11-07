package org.apache.datawise.backend.platform.schedule;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OrchestrationHttpSupportTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private HttpServer server;
    private String baseUrl;
    private final AtomicInteger statusToReturn = new AtomicInteger(200);
    private final AtomicReference<String> lastMethod = new AtomicReference<>();
    private final AtomicReference<String> lastBody = new AtomicReference<>();

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/hook", exchange -> {
            lastMethod.set(exchange.getRequestMethod());
            lastBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = "{\"ok\":true,\"dag_run_id\":\"run-1\",\"state\":\"queued\"}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(statusToReturn.get(), response.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(response);
            }
        });
        server.createContext("/status/", exchange -> {
            lastMethod.set(exchange.getRequestMethod());
            byte[] response = "{\"dag_run_id\":\"run-1\",\"state\":\"success\"}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(response);
            }
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/hook";
    }

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void postsJsonBodyAndAccepts2xx() throws Exception {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("url", baseUrl);
        payload.put("method", "POST");
        payload.set("bodyJson", objectMapper.readTree("{\"conf\":{\"x\":1}}"));
        payload.set("headers", objectMapper.createObjectNode().put("X-Test", "1"));

        OrchestrationHttpSupport.Result result = OrchestrationHttpSupport.execute(payload, objectMapper, httpClient);

        assertEquals(200, result.statusCode());
        assertEquals("POST", lastMethod.get());
        assertTrue(lastBody.get().contains("\"x\":1"));
        assertTrue(result.bodyPreview().contains("ok"));
    }

    @Test
    void failsOutsideSuccessStatusWindow() {
        statusToReturn.set(500);
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("url", baseUrl);
        payload.put("method", "POST");

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> OrchestrationHttpSupport.execute(payload, objectMapper, httpClient)
        );
        assertTrue(ex.getMessage().contains("HTTP 500"));
    }

    @Test
    void rejectsNonHttpUrl() {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("url", "ftp://example.com/x");
        assertThrows(
                IllegalArgumentException.class,
                () -> OrchestrationHttpSupport.execute(payload, objectMapper, httpClient)
        );
    }

    @Test
    void extractsRefAndStateFromAirflowStyleJson() {
        String body = "{\"dag_run_id\":\"manual__1\",\"state\":\"running\"}";
        assertEquals("manual__1", OrchestrationHttpSupport.extractRef(body, objectMapper));
        assertEquals("running", OrchestrationHttpSupport.extractState(body, objectMapper, null));
        assertNull(OrchestrationHttpSupport.extractRef("not-json", objectMapper));
    }

    @Test
    void resolveStatusUrlUsesTemplatePlaceholders() {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put(
                "statusUrlTemplate",
                "https://airflow.example/api/v1/dags/x/dagRuns/{dag_run_id}"
        );
        assertEquals(
                "https://airflow.example/api/v1/dags/x/dagRuns/run-9",
                OrchestrationHttpSupport.resolveStatusUrl(payload, "run-9")
        );
    }

    @Test
    void fetchStatusGetsRemoteState() throws Exception {
        String statusBase = "http://127.0.0.1:" + server.getAddress().getPort() + "/status/{dag_run_id}";
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("statusUrlTemplate", statusBase);

        OrchestrationHttpSupport.Result result =
                OrchestrationHttpSupport.fetchStatus(payload, "run-1", objectMapper, httpClient);

        assertEquals("GET", lastMethod.get());
        assertEquals(200, result.statusCode());
        assertEquals("success", OrchestrationHttpSupport.extractState(result.body(), objectMapper, payload));
        assertEquals("run-1", OrchestrationHttpSupport.extractRef(result.body(), objectMapper));
    }
}
