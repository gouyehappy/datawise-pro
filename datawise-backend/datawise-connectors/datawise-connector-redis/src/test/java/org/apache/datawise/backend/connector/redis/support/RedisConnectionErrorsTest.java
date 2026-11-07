package org.apache.datawise.backend.connector.redis.support;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RedisConnectionErrorsTest {

    @Test
    void toUserMessage_avoidsRawDriverMessage() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("127.0.0.1");
        entity.setPort("6379");
        Exception error = new RuntimeException("io.netty.channel.AbstractChannel$AnnotatedConnectException: Connection refused");

        String message = RedisConnectionErrors.toUserMessage(entity, error);

        assertTrue(message.contains("Cannot reach Redis"));
        assertFalse(message.contains("AnnotatedConnectException"));
    }
}
