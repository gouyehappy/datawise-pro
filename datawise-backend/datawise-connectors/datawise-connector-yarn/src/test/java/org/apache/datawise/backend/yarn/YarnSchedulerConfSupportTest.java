package org.apache.datawise.backend.yarn;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;

class YarnSchedulerConfSupportTest {

    @Test
    void buildUpdateQueuePayload_containsQueueAndParams() {
        String json = YarnSchedulerConfSupport.buildUpdateQueuePayload(
                "root.default",
                Map.of("state", "STOPPED", "capacity", "50")
        );
        assertTrue(json.contains("\"queue-name\":\"root.default\""));
        assertTrue(json.contains("\"key\":\"state\""));
        assertTrue(json.contains("\"value\":\"STOPPED\""));
        assertTrue(json.contains("\"key\":\"capacity\""));
    }

    @Test
    void buildRemoveQueuePayload_containsQueueName() {
        String json = YarnSchedulerConfSupport.buildRemoveQueuePayload("root.new");
        assertTrue(json.contains("\"remove-queue\":\"root.new\""));
    }
}
