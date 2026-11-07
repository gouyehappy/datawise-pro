package org.apache.datawise.backend.connector.redis.support;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RedisConnectionSupportTest {

    @Test
    void parseCommandLine_splitsWhitespaceAndQuotes() {
        assertEquals(List.of("GET", "mykey"), RedisConnectionSupport.parseCommandLine("GET mykey"));
        assertEquals(List.of("SET", "foo", "bar baz"), RedisConnectionSupport.parseCommandLine("SET foo \"bar baz\""));
        assertEquals(List.of("HSET", "hash", "field", "value"), RedisConnectionSupport.parseCommandLine("  HSET hash field value  "));
    }

    @Test
    void formatCommandResult_rendersNilAndCollections() {
        assertEquals("(nil)", RedisConnectionSupport.formatCommandResult(null));
        assertEquals("42", RedisConnectionSupport.formatCommandResult(42L));
        assertEquals("1) a\n2) b", RedisConnectionSupport.formatCommandResult(List.of("a", "b")));
        assertEquals("(empty list)", RedisConnectionSupport.formatCommandResult(List.of()));
    }
}
