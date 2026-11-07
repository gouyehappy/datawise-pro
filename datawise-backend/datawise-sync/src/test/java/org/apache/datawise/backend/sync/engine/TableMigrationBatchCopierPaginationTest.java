package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TableMigrationBatchCopierPaginationTest {

    @Test
    void fullPageWithFalseHasMore_returnsTrue() {
        ExecuteSqlResult page = pageResult(List.of(Map.of("id", 1), Map.of("id", 2)), false, 2);
        assertTrue(TableMigrationBatchCopier.shouldFetchAnotherPage(page, 2));
    }

    @Test
    void partialPageWithFalseHasMore_returnsFalse() {
        ExecuteSqlResult page = pageResult(List.of(Map.of("id", 1)), false, 2);
        assertFalse(TableMigrationBatchCopier.shouldFetchAnotherPage(page, 2));
    }

    @Test
    void partialPageWithTrueHasMore_returnsTrue() {
        ExecuteSqlResult page = pageResult(List.of(Map.of("id", 1)), true, 100);
        assertTrue(TableMigrationBatchCopier.shouldFetchAnotherPage(page, 100));
    }

    private static ExecuteSqlResult pageResult(List<Map<String, Object>> rows, boolean hasMore, int pageSize) {
        return new ExecuteSqlResult(
                "select * from users",
                rows.size(),
                1L,
                List.of(),
                rows,
                null,
                null,
                null,
                hasMore,
                0,
                pageSize
        );
    }
}
