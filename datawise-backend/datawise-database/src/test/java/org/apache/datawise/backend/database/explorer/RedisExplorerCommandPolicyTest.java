package org.apache.datawise.backend.database.explorer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RedisExplorerCommandPolicyTest {

    @Test
    void allowsReadCommands() {
        assertDoesNotThrow(() -> RedisExplorerCommandPolicy.requireAllowed("GET mykey"));
        assertDoesNotThrow(() -> RedisExplorerCommandPolicy.requireAllowed("  hgetall \"user:1\" "));
    }

    @Test
    void blocksDestructiveCommands() {
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> RedisExplorerCommandPolicy.requireAllowed("FLUSHALL")
        );
        assertEquals("Redis command is not allowed: FLUSHALL", ex.getMessage());
    }

    @Test
    void rejectsBlankCommand() {
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> RedisExplorerCommandPolicy.requireAllowed("   ")
        );
        assertEquals("Redis command is required", ex.getMessage());
    }
}
