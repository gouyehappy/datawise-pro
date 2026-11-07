package org.apache.datawise.backend.redis;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RedisClientFactoryTest {

    @Test
    void parsePort_defaultsAndParses() {
        assertEquals(6379, RedisClientFactory.parsePort(null));
        assertEquals(6379, RedisClientFactory.parsePort(""));
        assertEquals(6379, RedisClientFactory.parsePort("bad"));
        assertEquals(6380, RedisClientFactory.parsePort("6380"));
    }

    @Test
    void parseDb_defaultsAndClamps() {
        assertEquals(0, RedisClientFactory.parseDb(null));
        assertEquals(0, RedisClientFactory.parseDb(""));
        assertEquals(0, RedisClientFactory.parseDb("x"));
        assertEquals(5, RedisClientFactory.parseDb("5"));
        assertEquals(0, RedisClientFactory.parseDb("-3"));
    }
}
