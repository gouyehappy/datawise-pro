package org.apache.datawise.backend.connector.api.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RedisCommandPolicyTest {

    @Test
    void allowsReadCommands() {
        assertDoesNotThrow(() -> RedisCommandPolicy.requireAllowed("GET mykey"));
        assertDoesNotThrow(() -> RedisCommandPolicy.requireAllowed("  hgetall \"user:1\" "));
    }

    @Test
    void blocksDestructiveCommands() {
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> RedisCommandPolicy.requireAllowed("FLUSHALL"));
        assertEquals("Redis command is not allowed: FLUSHALL", ex.getMessage());
    }

    @Test
    void rejectsBlankCommand() {
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> RedisCommandPolicy.requireAllowed("   "));
        assertEquals("Redis command is required", ex.getMessage());
    }
}
