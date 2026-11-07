package org.apache.datawise.backend.connector.mongodb.support;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class MongoConnectionErrorsTest {

    @Test
    void toUserMessage_mapsAuthenticationFailure() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("127.0.0.1");
        entity.setPort("27017");

        String message = MongoConnectionErrors.toUserMessage(
                entity,
                new RuntimeException("Authentication failed")
        );

        assertTrue(message.contains("authentication failed"));
    }
}
