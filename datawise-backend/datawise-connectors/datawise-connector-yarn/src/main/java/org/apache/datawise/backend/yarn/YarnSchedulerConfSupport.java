package org.apache.datawise.backend.yarn;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Map;

/** Builds JSON bodies for YARN scheduler-conf mutation API. */
final class YarnSchedulerConfSupport {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private YarnSchedulerConfSupport() {
    }

    static String buildUpdateQueuePayload(String queueName, Map<String, String> params) {
        if (queueName == null || queueName.isBlank()) {
            throw new IllegalArgumentException("queueName is required");
        }
        if (params == null || params.isEmpty()) {
            throw new IllegalArgumentException("params is required");
        }
        ObjectNode root = MAPPER.createObjectNode();
        ObjectNode updateQueue = root.putObject("update-queue");
        updateQueue.put("queue-name", queueName.trim());
        ObjectNode paramsNode = updateQueue.putObject("params");
        ArrayNode entries = paramsNode.putArray("entry");
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (entry.getKey() == null || entry.getKey().isBlank()) {
                continue;
            }
            if (entry.getValue() == null) {
                continue;
            }
            ObjectNode item = entries.addObject();
            item.put("key", entry.getKey().trim());
            item.put("value", entry.getValue().trim());
        }
        if (entries.isEmpty()) {
            throw new IllegalArgumentException("params is required");
        }
        try {
            return MAPPER.writeValueAsString(root);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to serialize scheduler-conf payload", ex);
        }
    }

    static String buildRemoveQueuePayload(String queueName) {
        if (queueName == null || queueName.isBlank()) {
            throw new IllegalArgumentException("queueName is required");
        }
        ObjectNode root = MAPPER.createObjectNode();
        root.put("remove-queue", queueName.trim());
        try {
            return MAPPER.writeValueAsString(root);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to serialize scheduler-conf payload", ex);
        }
    }
}
