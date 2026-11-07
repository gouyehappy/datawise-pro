package org.apache.datawise.backend.jdbc.execution.pagination;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
}
