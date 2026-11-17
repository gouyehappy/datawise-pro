package org.apache.datawise.backend.ai.service;

import com.alibaba.cloud.ai.graph.CompiledGraph;
import org.apache.datawise.backend.security.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class AgentWriteGrantServiceTest {

    private AgentWriteGrantService service;

    @BeforeEach
    void setUp() {
        service = new AgentWriteGrantService(mock(CompiledGraph.class));
        UserContext.set(42L, false, "ui-session", "tenant-a");
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void consumeSucceedsOnceAndRejectsReuse() {
        AgentWriteGrantService.GrantView grant = service.issue(new AgentWriteGrantService.IssueRequest(
                "conv-1",
                "conn-1",
                "db",
                null,
                "SELECT 1"));

        AgentWriteGrantService.ConsumedGrant consumed = service.consume(
                grant.grantId(),
                "SELECT 1",
                42L);
        assertEquals("conn-1", consumed.connectionId());
        assertEquals(0, service.grantCountForTest());

        IllegalArgumentException second = assertThrows(
                IllegalArgumentException.class,
                () -> service.consume(grant.grantId(), "SELECT 1", 42L));
        assertTrue(second.getMessage().contains("not found") || second.getMessage().contains("consumed"));
    }

    @Test
    void consumeIsAtomicUnderConcurrentResume() throws Exception {
        AgentWriteGrantService.GrantView grant = service.issue(new AgentWriteGrantService.IssueRequest(
                "conv-1",
                "conn-1",
                "db",
                null,
                "SELECT 1\n"));

        int threads = 16;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger success = new AtomicInteger();
        AtomicInteger failures = new AtomicInteger();
        List<Future<?>> futures = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            futures.add(pool.submit(() -> {
                UserContext.set(42L, false, "ui-session", "tenant-a");
                try {
                    start.await(5, TimeUnit.SECONDS);
                    service.consume(grant.grantId(), "SELECT 1", 42L);
                    success.incrementAndGet();
                } catch (IllegalArgumentException ex) {
                    failures.incrementAndGet();
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    failures.incrementAndGet();
                } finally {
                    UserContext.clear();
                }
            }));
        }
        start.countDown();
        for (Future<?> future : futures) {
            future.get(5, TimeUnit.SECONDS);
        }
        pool.shutdownNow();

        assertEquals(1, success.get());
        assertEquals(threads - 1, failures.get());
    }

    @Test
    void consumeRejectsSqlMismatch() {
        AgentWriteGrantService.GrantView grant = service.issue(new AgentWriteGrantService.IssueRequest(
                "conv-1",
                "conn-1",
                "db",
                null,
                "SELECT 1"));

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> service.consume(grant.grantId(), "SELECT 2", 42L));
        assertTrue(ex.getMessage().contains("confirmedSql"));
    }

    @Test
    void requireConfirmedSqlMatchesSafeSqlRejectsMismatch() {
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> AgentWriteGrantService.requireConfirmedSqlMatchesSafeSql(
                        "SELECT evil FROM t",
                        "SELECT 1"));
        assertTrue(ex.getMessage().contains("SAFE_SQL"));
    }

    @Test
    void requireConfirmedSqlMatchesSafeSqlAcceptsNormalizedMatch() {
        AgentWriteGrantService.requireConfirmedSqlMatchesSafeSql(
                "  SELECT 1\r\n",
                "SELECT 1");
    }

    @Test
    void requireConnectionMatchesRejectsScopeDrift() {
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> AgentWriteGrantService.requireConnectionMatches("conn-a", "conn-b"));
        assertTrue(ex.getMessage().contains("connectionId"));
    }
}
