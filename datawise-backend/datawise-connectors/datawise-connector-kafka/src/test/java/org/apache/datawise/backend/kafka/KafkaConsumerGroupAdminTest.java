package org.apache.datawise.backend.kafka;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class KafkaConsumerGroupAdminTest {

    @Test
    void computeLag_usesEndMinusCommitted() {
        assertEquals(5L, KafkaConsumerGroupAdmin.computeLag(10L, 15L));
        assertEquals(0L, KafkaConsumerGroupAdmin.computeLag(15L, 15L));
    }

    @Test
    void computeLag_treatsMissingCommittedAsFullTopicLag() {
        assertEquals(12L, KafkaConsumerGroupAdmin.computeLag(-1L, 12L));
        assertEquals(0L, KafkaConsumerGroupAdmin.computeLag(-1L, 0L));
    }
}
