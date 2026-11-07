package org.apache.datawise.backend.connector.kafka.support;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class KafkaConnectionErrorsTest {

    @Test
    void toUserMessage_mapsAuthenticationFailures() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("localhost");
        entity.setPort("9092");
        String message = KafkaConnectionErrors.toUserMessage(
                entity,
                new RuntimeException("Authentication failed during authentication")
        );
        assertTrue(message.contains("authentication"));
    }
}
