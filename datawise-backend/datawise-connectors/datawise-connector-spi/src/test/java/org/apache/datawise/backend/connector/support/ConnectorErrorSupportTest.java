package org.apache.datawise.backend.connector.support;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class ConnectorErrorSupportTest {

    @Test
    void redisAuthFailureUsesTemplateHint() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("127.0.0.1");
        entity.setPort("6379");

        String message = ConnectorErrorSupport.toUserMessage(
                entity,
                new RuntimeException("NOAUTH Authentication required"),
                ConnectorErrorTemplate.redis());

        assertTrue(message.contains("Redis authentication failed"));
        assertTrue(message.contains("127.0.0.1:6379"));
        assertTrue(message.contains("NOAUTH Authentication required"));
    }

    @Test
    void includesRootErrorDetailsForGenericFailures() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("10.0.0.1");
        entity.setPort("7051");

        String message = ConnectorErrorSupport.toUserMessage(
                entity,
                new RuntimeException("Could not find the requested table: impala::default.sample"),
                ConnectorErrorTemplate.kudu());

        assertTrue(message.contains("Kudu operation failed"));
        assertTrue(message.contains("Could not find the requested table"));
    }

    @Test
    void sanitizesNettyExceptionClassFromDetails() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("127.0.0.1");
        entity.setPort("6379");

        String message = ConnectorErrorSupport.toUserMessage(
                entity,
                new RuntimeException(
                        "io.netty.channel.AbstractChannel$AnnotatedConnectException: Connection refused"),
                ConnectorErrorTemplate.redis());

        assertTrue(message.contains("Cannot reach Redis"));
        assertTrue(message.contains("Connection refused"));
        assertTrue(!message.contains("AnnotatedConnectException"));
    }
}
