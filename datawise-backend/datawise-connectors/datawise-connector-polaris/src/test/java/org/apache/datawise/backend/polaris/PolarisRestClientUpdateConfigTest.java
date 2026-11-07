package org.apache.datawise.backend.polaris;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PolarisRestClientUpdateConfigTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private HttpServer server;
    private String baseUrl;
    private final AtomicReference<String> lastMethod = new AtomicReference<>();
    private final AtomicReference<String> lastPath = new AtomicReference<>();
    private final AtomicReference<String> lastBody = new AtomicReference<>();
    private volatile int responseStatus = 200;
    private volatile String responseBody = "{\"code\":200000,\"info\":\"ok\",\"data\":{}}";

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            lastMethod.set(exchange.getRequestMethod());
            lastPath.set(exchange.getRequestURI().getPath());
            byte[] bytes = exchange.getRequestBody().readAllBytes();
            lastBody.set(new String(bytes, StandardCharsets.UTF_8));
            byte[] out = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(responseStatus, out.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(out);
            }
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void updateConfigFile_putsJsonBody() throws Exception {
        PolarisRestClient client = new PolarisRestClient(config());
        JsonNode root = client.updateConfigFile("prod", "DEFAULT", "app.yaml", "a: 1", "yaml");

        assertEquals("PUT", lastMethod.get());
        assertEquals("/config/v1/configfiles", lastPath.get());
        JsonNode body = MAPPER.readTree(lastBody.get());
        assertEquals("prod", body.path("namespace").asText());
        assertEquals("DEFAULT", body.path("group").asText());
        assertEquals("app.yaml", body.path("name").asText());
        assertEquals("a: 1", body.path("content").asText());
        assertEquals("yaml", body.path("format").asText());
        assertEquals(200000, root.path("code").asInt());
    }

    @Test
    void updateConfigFile_omitsBlankFormat() throws Exception {
        PolarisRestClient client = new PolarisRestClient(config());
        client.updateConfigFile("ns", "g", "n", "content", "  ");

        JsonNode body = MAPPER.readTree(lastBody.get());
        assertTrue(body.path("format").isMissingNode());
        assertEquals("content", body.path("content").asText());
    }

    @Test
    void updateConfigFile_throwsOnBusinessError() {
        responseBody = "{\"code\":400000,\"info\":\"bad request\"}";
        PolarisRestClient client = new PolarisRestClient(config());
        IOException err = assertThrows(
                IOException.class,
                () -> client.updateConfigFile("ns", "g", "n", "c", null)
        );
        assertTrue(err.getMessage().toLowerCase().contains("polaris")
                || err.getMessage().toLowerCase().contains("bad"));
    }

    @Test
    void releaseConfigFile_postsConfigFileReleaseFieldsOnly() throws Exception {
        PolarisRestClient client = new PolarisRestClient(config());
        client.releaseConfigFile("prod", "DEFAULT_GROUP", "sdg-server.yaml");

        assertEquals("POST", lastMethod.get());
        assertEquals("/config/v1/configfiles/release", lastPath.get());
        JsonNode body = MAPPER.readTree(lastBody.get());
        assertEquals("prod", body.path("namespace").asText());
        assertEquals("DEFAULT_GROUP", body.path("group").asText());
        assertEquals("sdg-server.yaml", body.path("file_name").asText());
        // release version label — must not reuse the config file name
        assertTrue(body.path("name").asText().startsWith("datawise-"));
        assertTrue(!body.path("name").asText().equals("sdg-server.yaml"));
        assertEquals("Updated via DataWise", body.path("comment").asText());
        // protobuf JSON rejects unknown fields like release_name / releaseName
        assertTrue(body.path("release_name").isMissingNode());
        assertTrue(body.path("releaseName").isMissingNode());
    }

    private PolarisConnectionConfig config() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost(baseUrl);
        return PolarisConnectionConfig.from(entity);
    }
}
