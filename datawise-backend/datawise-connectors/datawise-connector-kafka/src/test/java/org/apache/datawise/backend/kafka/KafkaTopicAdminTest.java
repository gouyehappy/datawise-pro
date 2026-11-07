package org.apache.datawise.backend.kafka;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KafkaTopicAdminTest {

    @Test
    void convertGlobToRegex_matchesWildcardTopics() {
        String regex = KafkaTopicAdmin.convertGlobToRegex("orders-*");
        assertTrue("orders-live".matches(regex));
        assertFalse("events-live".matches(regex));
    }
}
