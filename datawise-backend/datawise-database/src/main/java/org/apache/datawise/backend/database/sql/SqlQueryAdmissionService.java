package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.common.SqlConcurrencyLimitException;
import org.apache.datawise.backend.config.DatawiseQueryProperties;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Synchronous admission for interactive SQL (console execute + cursor pages).
 * <p>
 * Unlike {@code task-concurrency} (async queue for backup/migration), SQL must
 * run on the request thread; we only gate in-flight count and fail fast with 429.
 */
@Component
public class SqlQueryAdmissionService {

    private static final Lease NOOP = new Lease(null, -1L, null, false);

    private final DatawiseQueryProperties properties;
    private final AtomicInteger globalInFlight = new AtomicInteger();
    private final ConcurrentHashMap<Long, AtomicInteger> userInFlight = new ConcurrentHashMap<>();

    public SqlQueryAdmissionService(DatawiseQueryProperties properties) {
        this.properties = properties != null ? properties : new DatawiseQueryProperties();
    }

    /**
     * Acquires a lease for {@code userId}. Caller must close the lease (try-with-resources).
     */
    public Lease acquire(long userId) {
        int perUserMax = properties.getMaxConcurrentPerUser();
        int globalMax = properties.getMaxConcurrentGlobal();
        if (perUserMax <= 0 && globalMax <= 0) {
            return NOOP;
        }

        AtomicInteger userCounter = null;
        boolean userHeld = false;
        boolean globalHeld = false;
        try {
            if (perUserMax > 0) {
                userCounter = userInFlight.computeIfAbsent(userId, ignored -> new AtomicInteger());
                if (!tryIncrement(userCounter, perUserMax)) {
                    throw SqlConcurrencyLimitException.perUser(perUserMax);
                }
                userHeld = true;
            }
            if (globalMax > 0) {
                if (!tryIncrement(globalInFlight, globalMax)) {
                    throw SqlConcurrencyLimitException.global(globalMax);
                }
                globalHeld = true;
            }
            Lease lease = new Lease(this, userId, userHeld ? userCounter : null, globalHeld);
            userHeld = false;
            globalHeld = false;
            return lease;
        } finally {
            if (globalHeld) {
                globalInFlight.decrementAndGet();
            }
            if (userHeld && userCounter != null) {
                releaseUserSlot(userId, userCounter);
            }
        }
    }

    int globalInFlight() {
        return globalInFlight.get();
    }

    int userInFlight(long userId) {
        AtomicInteger counter = userInFlight.get(userId);
        return counter == null ? 0 : Math.max(0, counter.get());
    }

    /** Test hook: number of per-user counters retained in memory. */
    int trackedUserCount() {
        return userInFlight.size();
    }

    private void release(long userId, AtomicInteger userCounter, boolean globalHeld) {
        if (userCounter != null) {
            releaseUserSlot(userId, userCounter);
        }
        if (globalHeld) {
            globalInFlight.decrementAndGet();
        }
    }

    /**
     * Decrements the per-user counter and removes the map entry only when still zero,
     * so a concurrent acquire that revived the same counter is not dropped.
     */
    private void releaseUserSlot(long userId, AtomicInteger userCounter) {
        userCounter.decrementAndGet();
        userInFlight.compute(userId, (id, current) -> {
            if (current != userCounter) {
                return current;
            }
            return current.get() <= 0 ? null : current;
        });
    }

    private static boolean tryIncrement(AtomicInteger counter, int max) {
        while (true) {
            int current = counter.get();
            if (current >= max) {
                return false;
            }
            if (counter.compareAndSet(current, current + 1)) {
                return true;
            }
        }
    }

    public static final class Lease implements AutoCloseable {
        private final SqlQueryAdmissionService owner;
        private final long userId;
        private final AtomicInteger userCounter;
        private final boolean globalHeld;
        private boolean closed;

        private Lease(
                SqlQueryAdmissionService owner,
                long userId,
                AtomicInteger userCounter,
                boolean globalHeld
        ) {
            this.owner = owner;
            this.userId = userId;
            this.userCounter = userCounter;
            this.globalHeld = globalHeld;
        }

        @Override
        public void close() {
            if (closed || owner == null) {
                closed = true;
                return;
            }
            closed = true;
            owner.release(userId, userCounter, globalHeld);
        }
    }
}
