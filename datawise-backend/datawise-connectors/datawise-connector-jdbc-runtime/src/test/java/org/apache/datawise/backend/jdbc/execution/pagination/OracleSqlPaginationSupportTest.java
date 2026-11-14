package org.apache.datawise.backend.jdbc.execution.pagination;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OracleSqlPaginationSupportTest {

    @Test
    void applyLimitOffset_firstPageUsesRownumWithStableOrder() {
        assertEquals(
                "SELECT * FROM (SELECT * FROM (SELECT * FROM \"DBSDBA\".\"HIVE_1115\" ORDER BY ROWID) WHERE ROWNUM <= 101)",
                OracleSqlPaginationSupport.applyLimitOffset(
                        "SELECT * FROM \"DBSDBA\".\"HIVE_1115\"",
                        101,
                        0
                )
        );
    }

    @Test
    void applyLimitOffset_nextPageUsesOffsetFetchWithStableOrder() {
        assertEquals(
                "SELECT * FROM t ORDER BY ROWID OFFSET 10 ROWS FETCH NEXT 50 ROWS ONLY",
                OracleSqlPaginationSupport.applyLimitOffset("SELECT * FROM t", 50, 10)
        );
    }

    @Test
    void applyLimitOffset_preservesExistingOrderBy() {
        assertEquals(
                "SELECT * FROM (SELECT * FROM (SELECT * FROM t ORDER BY created_at DESC) WHERE ROWNUM <= 10)",
                OracleSqlPaginationSupport.applyLimitOffset("SELECT * FROM t ORDER BY created_at DESC", 10, 0)
        );
    }

    @Test
    void applyLimitOffset_skipsRowIdForCount() {
        assertEquals(
                "SELECT * FROM (SELECT * FROM (SELECT COUNT(*) FROM t) WHERE ROWNUM <= 10)",
                OracleSqlPaginationSupport.applyLimitOffset("SELECT COUNT(*) FROM t", 10, 0)
        );
    }

    @Test
    void applyLimitOffset_skipsRowIdForGroupBy() {
        assertEquals(
                "SELECT * FROM t GROUP BY dept OFFSET 5 ROWS FETCH NEXT 20 ROWS ONLY",
                OracleSqlPaginationSupport.applyLimitOffset("SELECT * FROM t GROUP BY dept", 20, 5)
        );
    }

    @Test
    void applyLimitOffset_skipsRowIdForDistinct() {
        assertEquals(
                "SELECT * FROM (SELECT * FROM (SELECT DISTINCT name FROM t) WHERE ROWNUM <= 10)",
                OracleSqlPaginationSupport.applyLimitOffset("SELECT DISTINCT name FROM t", 10, 0)
        );
    }

    @Test
    void applyLimitOffset_skipsRowIdForUnion() {
        String sql = "SELECT a FROM t1 UNION SELECT a FROM t2";
        assertEquals(
                "SELECT * FROM (SELECT * FROM (" + sql + ") WHERE ROWNUM <= 10)",
                OracleSqlPaginationSupport.applyLimitOffset(sql, 10, 0)
        );
    }

    @Test
    void canAppendStableRowIdOrder_ignoresKeywordsInsideLiterals() {
        assertTrue(OracleSqlPaginationSupport.canAppendStableRowIdOrder(
                "SELECT * FROM t WHERE note = 'group by x'"
        ));
        assertFalse(OracleSqlPaginationSupport.canAppendStableRowIdOrder(
                "SELECT COUNT(*) FROM t /* ORDER BY ignored for detection */"
        ));
    }
}
