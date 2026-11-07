package org.apache.datawise.backend.platform.schedule;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ScheduledHttpTriggerSupportTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void canPollWhenAbsoluteStatusUrlPresent() {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("statusUrl", "https://example.com/status");
        assertTrue(ScheduledHttpTriggerSupport.canPoll(payload, null));
        assertTrue(ScheduledHttpTriggerSupport.canPoll(payload, ""));
    }

    @Test
    void canPollTemplateRequiresRef() {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("statusUrlTemplate", "https://example.com/jobs/{ref}");
        assertFalse(ScheduledHttpTriggerSupport.canPoll(payload, null));
        assertFalse(ScheduledHttpTriggerSupport.canPoll(payload, " "));
        assertTrue(ScheduledHttpTriggerSupport.canPoll(payload, "job-1"));
    }

    @Test
    void canPollFalseWithoutStatusConfig() {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("url", "https://example.com/trigger");
        assertFalse(ScheduledHttpTriggerSupport.canPoll(payload, "job-1"));
    }
}
