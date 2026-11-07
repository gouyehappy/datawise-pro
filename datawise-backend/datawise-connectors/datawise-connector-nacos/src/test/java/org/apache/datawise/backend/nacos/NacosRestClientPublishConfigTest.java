package org.apache.datawise.backend.nacos;

import com.sun.net.httpserver.HttpServer;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NacosRestClientPublishConfigTest {

    private HttpServer server;
    private String baseUrl;
    private final AtomicReference<String> lastMethod = new AtomicReference<>();
    private final AtomicReference<String> lastBody = new AtomicReference<>();
    private final AtomicReference<String> lastContentType = new AtomicReference<>();
    private volatile String responseBody = "true";
    private volatile int responseStatus = 200;

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/nacos/v1/cs/configs", exchange -> {
            lastMethod.set(exchange.getRequestMethod());
            lastContentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            byte[] bytes = exchange.getRequestBody().readAllBytes();
            lastBody.set(new String(bytes, StandardCharsets.UTF_8));
            byte[] out = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(responseStatus, out.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(out);
            }
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/nacos";
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void publishConfig_postsFormEncodedFields() throws Exception {
        NacosRestClient client = new NacosRestClient(config());
        assertTrue(client.publishConfig("app.yaml", "DEFAULT_GROUP", "ns-1", "k: v", "yaml"));

        assertEquals("POST", lastMethod.get());
        assertTrue(lastContentType.get() != null && lastContentType.get().contains("application/x-www-form-urlencoded"));
        Map<String, String> form = parseForm(lastBody.get());
        assertEquals("app.yaml", form.get("dataId"));
        assertEquals("DEFAULT_GROUP", form.get("group"));
        assertEquals("ns-1", form.get("tenant"));
        assertEquals("k: v", form.get("content"));
        assertEquals("yaml", form.get("type"));
    }

    @Test
    void publishConfig_defaultsBlankGroupAndOmitsBlankType() throws Exception {
        NacosRestClient client = new NacosRestClient(config());
        assertTrue(client.publishConfig("only-data-id", "  ", "", "body", "  "));

        Map<String, String> form = parseForm(lastBody.get());
        assertEquals("DEFAULT_GROUP", form.get("group"));
        assertEquals("", form.get("tenant"));
        assertEquals("body", form.get("content"));
        assertTrue(!form.containsKey("type"));
    }

    @Test
    void publishConfig_throwsWhenServerReturnsFalse() {
        responseBody = "false";
        NacosRestClient client = new NacosRestClient(config());
        IOException err = assertThrows(
                IOException.class,
                () -> client.publishConfig("x", "g", "", "c", null)
        );
        assertTrue(err.getMessage().contains("false"));
    }

    private NacosConnectionConfig config() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost(baseUrl);
        return NacosConnectionConfig.from(entity);
    }

    private static Map<String, String> parseForm(String body) {
        Map<String, String> map = new HashMap<>();
        if (body == null || body.isBlank()) {
            return map;
        }
        for (String pair : body.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) {
                map.put(URLDecoder.decode(pair, StandardCharsets.UTF_8), "");
                continue;
            }
            String key = URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8);
            String value = URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
            map.put(key, value);
        }
        return map;
    }
}
