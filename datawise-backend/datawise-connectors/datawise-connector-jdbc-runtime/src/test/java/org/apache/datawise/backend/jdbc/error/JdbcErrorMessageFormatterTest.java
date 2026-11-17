package org.apache.datawise.backend.jdbc.error;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcErrorMessageFormatterTest {

    @Test
    void describeTarget_redactsPasswordInJdbcUrl() throws Exception {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("postgresql");
        entity.setJdbcUrl("jdbc:postgresql://db:5432/app?password=super-secret&ssl=true");

        String target = invokeDescribeTarget(entity);
        assertFalse(target.contains("super-secret"));
        assertTrue(target.contains("password=***"));
        assertTrue(target.contains("connectionId=conn-1"));
    }

    @Test
    void toUserMessage_doesNotEchoRawDetailsForNetworkFailures() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setName("prod");
        entity.setHost("db.internal");
        entity.setPort("5432");
        entity.setDbType("postgresql");

        String message = JdbcErrorMessageFormatter.toUserMessage(
                entity,
                new SQLException("Connection refused: jdbc:postgresql://db:5432/app?password=leak"));
        assertFalse(message.contains("Details:"));
        assertFalse(message.contains("password=leak"));
        assertTrue(message.contains("Cannot reach database"));
    }

    @Test
    void sanitizeForClient_redactsPasswordInFreeText() {
        String sanitized = JdbcErrorMessageFormatter.sanitizeForClient(
                "failed jdbc:postgresql://db:5432/app?password=super-secret");
        assertFalse(sanitized.contains("super-secret"));
        assertTrue(sanitized.contains("password=***"));
    }

    private static String invokeDescribeTarget(ConnectionEntity entity) throws Exception {
        Method method = JdbcErrorMessageFormatter.class.getDeclaredMethod("describeTarget", ConnectionEntity.class);
        method.setAccessible(true);
        return (String) method.invoke(null, entity);
    }
}
