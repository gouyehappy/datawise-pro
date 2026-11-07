package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

class ExplorerRedisServiceTest {

    @Test
    void resolveRedisConnectionReturnsSameEntityWhenDatabaseMissing() {
        ConnectionEntity entity = baseEntity();
        entity.setDatabaseName("2");

        ConnectionEntity resolved = ExplorerRedisService.resolveRedisConnection(entity, null);
        assertSame(entity, resolved);
    }

    @Test
    void resolveRedisConnectionOverridesDatabaseWithoutMutatingSource() {
        ConnectionEntity entity = baseEntity();
        entity.setDatabaseName("2");
        entity.setDbType("redis");

        ConnectionEntity resolved = ExplorerRedisService.resolveRedisConnection(entity, 5);

        assertEquals("2", entity.getDatabaseName());
        assertEquals("redis", entity.getDbType());
        assertEquals("5", resolved.getDatabaseName());
        assertEquals("redis", resolved.getDbType());
        assertEquals(entity.getHost(), resolved.getHost());
        assertEquals(entity.getPort(), resolved.getPort());
    }

    @Test
    void resolveRedisConnectionPreservesDbTypeForDbZero() {
        ConnectionEntity entity = baseEntity();
        entity.setDbType("redis");

        ConnectionEntity resolved = ExplorerRedisService.resolveRedisConnection(entity, 0);

        assertEquals("redis", resolved.getDbType());
        assertEquals("0", resolved.getDatabaseName());
    }

    private static ConnectionEntity baseEntity() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("127.0.0.1");
        entity.setPort("6379");
        entity.setUsername("user");
        entity.setPassword("secret");
        return entity;
    }
}
