package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.common.SqlCursorGoneException;
import org.springframework.scheduling.annotation.Scheduled;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

/** Process-local cursor store (desktop / single-node default). */
public class MemorySqlResultCursorStore implements SqlResultCursorStore {

    static final long TTL_MS = 30L * 60L * 1000L;
    static final int MAX_CURSORS = 512;

    private final ConcurrentHashMap<String, CursorEntry> entries = new ConcurrentHashMap<>();

    @Override
    public String create(
            long userId,
            String connectionId,
            String database,
            String sql,
            String sessionKey,
            int pageSize,
            int nextOffset,
            List<Map<String, Object>> columns
    ) {
        evictExpired();
        if (entries.size() >= MAX_CURSORS) {
            evictOldest();
        }
        String id = UUID.randomUUID().toString();
        long now = System.currentTimeMillis();
        entries.put(
                id,
                new CursorEntry(
                        userId,
                        connectionId,
                        database,
                        sql,
                        sessionKey,
                        pageSize,
                        nextOffset,
                        columns,
                        now
                )
        );
        return id;
    }

    @Override
    public CursorEntry require(long userId, String cursorId) {
        AtomicReference<CursorEntry> held = new AtomicReference<>();
        CursorEntry updated = entries.computeIfPresent(cursorId, (id, entry) -> {
            if (entry.userId() != userId) {
                held.set(null);
                return entry;
            }
            if (System.currentTimeMillis() - entry.lastAccessedAtMs() > TTL_MS) {
                held.set(null);
                return null;
            }
            CursorEntry touched = new CursorEntry(
                    entry.userId(),
                    entry.connectionId(),
                    entry.database(),
                    entry.sql(),
                    entry.sessionKey(),
                    entry.pageSize(),
                    entry.nextOffset(),
                    entry.columns(),
                    System.currentTimeMillis()
            );
            held.set(touched);
            return touched;
        });
        if (updated == null || held.get() == null) {
            throw new SqlCursorGoneException();
        }
        return held.get();
    }

    @Override
    public void updateOffset(String cursorId, int nextOffset) {
        entries.computeIfPresent(cursorId, (id, entry) -> new CursorEntry(
                entry.userId(),
                entry.connectionId(),
                entry.database(),
                entry.sql(),
                entry.sessionKey(),
                entry.pageSize(),
                nextOffset,
                entry.columns(),
                System.currentTimeMillis()
        ));
    }

    @Override
    public void remove(String cursorId) {
        entries.remove(cursorId);
    }

    @Override
    public void removeForUser(long userId, String cursorId) {
        if (cursorId == null || cursorId.isBlank()) {
            return;
        }
        entries.computeIfPresent(cursorId, (id, entry) -> entry.userId() == userId ? null : entry);
    }

    @Scheduled(fixedRate = 60_000)
    void evictExpiredScheduled() {
        evictExpired();
    }

    private void evictExpired() {
        long cutoff = System.currentTimeMillis() - TTL_MS;
        entries.entrySet().removeIf(entry -> entry.getValue().lastAccessedAtMs() < cutoff);
    }

    private void evictOldest() {
        entries.entrySet().stream()
                .min((left, right) -> Long.compare(
                        left.getValue().lastAccessedAtMs(),
                        right.getValue().lastAccessedAtMs()
                ))
                .ifPresent(oldest -> entries.remove(oldest.getKey()));
    }
}
