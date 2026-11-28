package org.apache.datawise.backend.ai.schema;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
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

    @Test
    void getOrLoadSingleFlightsConcurrentMiss() throws Exception {
        AiSchemaCache cache = new AiSchemaCache(60_000L);
        AtomicInteger loads = new AtomicInteger();
        String key = AiSchemaCache.tablesKey("t1", "c1", "db");
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);

        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        List<Future<String>> futures = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            futures.add(pool.submit(() -> cache.getOrLoad(key, () -> {
                loads.incrementAndGet();
                entered.countDown();
                try {
                    release.await(5, TimeUnit.SECONDS);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                }
                return "once";
            })));
        }
        assertEquals(true, entered.await(5, TimeUnit.SECONDS));
        release.countDown();
        for (Future<String> future : futures) {
            assertEquals("once", future.get(5, TimeUnit.SECONDS));
        }
        pool.shutdownNow();
        assertEquals(1, loads.get());
    }
}
