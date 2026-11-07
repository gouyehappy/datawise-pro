package org.apache.datawise.backend.database.federated;

/**
 * Server-side bounds for federated JOINs (in-memory + optional disk spill for hash build side).
 *
 * <p>Each source subquery is capped at {@link #resolveMaxRows(Integer)}; the joined result is also
 * capped at that limit. Cross joins without ON predicates are rejected when the cartesian product
 * would exceed {@link #MAX_CROSS_PRODUCT}. Equality JOINs spill the hash build side to temp files
 * when it exceeds {@link #MEMORY_HASH_BUILD_ROWS}.
 */
public final class FederatedJoinLimits {

    public static final int DEFAULT_MAX_ROWS = 1_000;
    public static final int HARD_MAX_ROWS = 10_000;
    /** Max left×right pairs allowed for ON-less (cross) joins before rejecting. */
    public static final long MAX_CROSS_PRODUCT = 2_000_000L;
    /**
     * When the hash-join build side exceeds this many rows, rows are partitioned to temp files
     * (Grace hash) instead of keeping the full map in heap.
     */
    public static final int MEMORY_HASH_BUILD_ROWS = 512;
    /** Number of spill partitions for Grace hash join. */
    public static final int SPILL_BUCKETS = 32;
    /** Max source-window offset to limit deep scans without tighter filters. */
    public static final int MAX_OFFSET = 100_000;

    private FederatedJoinLimits() {
    }

    public static int resolveMaxRows(Integer requested) {
        int rows = requested != null && requested > 0 ? requested : DEFAULT_MAX_ROWS;
        return Math.min(rows, HARD_MAX_ROWS);
    }

    public static int resolveOffset(Integer requested) {
        if (requested == null || requested <= 0) {
            return 0;
        }
        return Math.min(requested, MAX_OFFSET);
    }
}
