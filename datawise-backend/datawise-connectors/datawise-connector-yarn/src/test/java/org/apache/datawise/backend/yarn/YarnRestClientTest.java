package org.apache.datawise.backend.yarn;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class YarnRestClientTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void arrayOrSingle_handlesArrayAndSingleObject() throws Exception {
        JsonNode arrayRoot = MAPPER.readTree("""
                {"apps":{"app":[{"id":"a1"},{"id":"a2"}]}}
                """);
        List<JsonNode> apps = YarnRestClient.arrayOrSingle(arrayRoot.path("apps"), "app");
        assertEquals(2, apps.size());
        assertEquals("a1", apps.get(0).path("id").asText());

        JsonNode singleRoot = MAPPER.readTree("""
                {"apps":{"app":{"id":"only"}}}
                """);
        List<JsonNode> single = YarnRestClient.arrayOrSingle(singleRoot.path("apps"), "app");
        assertEquals(1, single.size());
        assertEquals("only", single.get(0).path("id").asText());
    }

    @Test
    void collectQueues_flattensNestedQueues() throws Exception {
        JsonNode root = MAPPER.readTree("""
                {
                  "queueName": "root",
                  "queues": {
                    "queue": [
                      {"queueName": "default", "capacity": 50.0},
                      {"queueName": "prod", "capacity": 50.0, "queues": {"queue": {"queueName": "prod-batch", "capacity": 100.0}}}
                    ]
                  }
                }
                """);
        List<JsonNode> queues = new java.util.ArrayList<>();
        YarnRestClient.collectQueues(root, queues);
        assertFalse(queues.isEmpty());
        assertEquals("root", YarnRestClient.text(queues.get(0), "queueName"));
        assertEquals("prod-batch", YarnRestClient.text(queues.get(queues.size() - 1), "queueName"));
    }

    @Test
    void connectionConfig_readsAdvancedProperties() {
        var entity = new org.apache.datawise.backend.model.ConnectionEntity();
        entity.setHost("rm.example.com");
        entity.setPort("8090");
        entity.setAdvancedConfig("""
                useHttps=true
                restPath=/ws/v1/cluster
                """);
        YarnConnectionConfig config = YarnConnectionConfig.from(entity);
        assertEquals("https://rm.example.com:8090/ws/v1/cluster", config.baseUrl());
    }
}
