package org.apache.datawise.backend.ai.rag.index;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.ai.rag.AiKnowledgeIndexService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;

/**
 * pgvector 索引重建：异步执行 + 并发上限 + 同 scope 最小间隔限流。
 */
@Component
public class AiKnowledgeIndexRebuildCoordinator {

    private static final Logger log = LoggerFactory.getLogger(AiKnowledgeIndexRebuildCoordinator.class);

    private final AiRagProperties ragProperties;
    private final AiKnowledgeIndexService indexService;
    private final Semaphore concurrencyGate;
    private final ExecutorService executor;
    private final Map<String, Long> lastRebuildEpochMs = new ConcurrentHashMap<>();
    private final Map<String, Boolean> inFlight = new ConcurrentHashMap<>();

    public AiKnowledgeIndexRebuildCoordinator(
            AiRagProperties ragProperties,
            AiKnowledgeIndexService indexService
    ) {
        this.ragProperties = ragProperties;
        this.indexService = indexService;
        int maxConcurrent = Math.max(1, ragProperties.getIndex().getMaxConcurrentRebuilds());
        this.concurrencyGate = new Semaphore(maxConcurrent);
        this.executor = Executors.newFixedThreadPool(maxConcurrent, runnable -> {
            Thread thread = new Thread(runnable, "ai-rag-index-rebuild");
            thread.setDaemon(true);
            return thread;
        });
    }

    public RebuildDecision schedule(String connectionId, String database) {
        if (!indexService.isPgVectorConfigured()) {
            return RebuildDecision.disabled("pgvector is not configured; set datawise.ai.rag.vector-store=pgvector and JDBC URL");
        }

        String scopeKey = scopeKey(connectionId, database);
        if (Boolean.TRUE.equals(inFlight.get(scopeKey))) {
            return RebuildDecision.inProgress("Rebuild already running for this scope");
        }

        long minIntervalMs = ragProperties.getIndex().getMinRebuildIntervalSeconds() * 1000L;
        long now = System.currentTimeMillis();
        Long lastRun = lastRebuildEpochMs.get(scopeKey);
        if (lastRun != null && now - lastRun < minIntervalMs) {
            return RebuildDecision.rateLimited("Rebuild rate limited; retry later");
        }

        if (!ragProperties.getIndex().isAsyncRebuild()) {
            lastRebuildEpochMs.put(scopeKey, now);
            int synced = indexService.rebuildIndex(connectionId, database);
            return RebuildDecision.completed(synced, "Synced " + synced + " knowledge entries to pgvector");
        }

        lastRebuildEpochMs.put(scopeKey, now);
        inFlight.put(scopeKey, true);
        executor.submit(() -> runRebuild(scopeKey, connectionId, database));
        return RebuildDecision.accepted("Rebuild accepted; running in background");
    }

    private void runRebuild(String scopeKey, String connectionId, String database) {
        boolean acquired = false;
        try {
            concurrencyGate.acquire();
            acquired = true;
            int synced = indexService.rebuildIndex(connectionId, database);
            log.info("Async pgvector rebuild finished scope={} synced={}", scopeKey, synced);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            log.warn("Async pgvector rebuild interrupted scope={}", scopeKey);
        } catch (RuntimeException ex) {
            log.warn("Async pgvector rebuild failed scope={}: {}", scopeKey, ex.getMessage());
        } finally {
            if (acquired) {
                concurrencyGate.release();
            }
            inFlight.remove(scopeKey);
        }
    }

    private static String scopeKey(String connectionId, String database) {
        String conn = connectionId != null ? connectionId.trim() : "";
        String db = database != null ? database.trim() : "";
        return conn + "|" + db;
    }

    public record RebuildDecision(String status, int syncedEntries, String message) {
        static RebuildDecision completed(int synced, String message) {
            return new RebuildDecision("completed", synced, message);
        }

        static RebuildDecision accepted(String message) {
            return new RebuildDecision("accepted", 0, message);
        }

        static RebuildDecision rateLimited(String message) {
            return new RebuildDecision("rate_limited", 0, message);
        }

        static RebuildDecision inProgress(String message) {
            return new RebuildDecision("in_progress", 0, message);
        }

        static RebuildDecision disabled(String message) {
            return new RebuildDecision("disabled", 0, message);
        }
    }
}
