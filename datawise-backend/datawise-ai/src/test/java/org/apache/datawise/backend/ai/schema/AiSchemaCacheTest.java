package org.apache.datawise.backend.ai.schema;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiSchemaCacheTest {

    @Test
    void getOrLoadReusesValueUntilInvalidate() {
        AiSchemaCache cache = new AiSchemaCache(60_000L);
        AtomicInteger loads = new AtomicInteger();
        String key = AiSchemaCache.tablesKey("t1", "c1", "db");

        String first = cache.getOrLoad(key, () -> {
            loads.incrementAndGet();
            return "tables";
        });
        String second = cache.getOrLoad(key, () -> {
            loads.incrementAndGet();
            return "tables-2";
        });

        assertEquals("tables", first);
        assertEquals("tables", second);
        assertEquals(1, loads.get());

        cache.invalidateConnection("t1", "c1");
        String third = cache.getOrLoad(key, () -> {
            loads.incrementAndGet();
            return "tables-3";
        });
        assertEquals("tables-3", third);
        assertEquals(2, loads.get());
    }
}
