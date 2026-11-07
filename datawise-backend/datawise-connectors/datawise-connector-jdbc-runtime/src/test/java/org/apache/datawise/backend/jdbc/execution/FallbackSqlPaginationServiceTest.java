package org.apache.datawise.backend.jdbc.execution;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FallbackSqlPaginationServiceTest {

    @Test
    void applyLimitOffset_oracleUsesOrderByOffsetFetch() {
        assertEquals(
                "SELECT * FROM (SELECT * FROM (SELECT * FROM \"DBSDBA\".\"HIVE_1114\" ORDER BY ROWID) WHERE ROWNUM <= 101)",
                FallbackSqlPaginationService.INSTANCE.applyLimitOffset(
                        "SELECT * FROM \"DBSDBA\".\"HIVE_1114\"",
                        "oracle",
                        101,
                        0
                )
        );
    }

    @Test
    void applyLimitOffset_mysqlUsesLimit() {
        assertEquals(
                "SELECT * FROM t LIMIT 50 OFFSET 10",
                FallbackSqlPaginationService.INSTANCE.applyLimitOffset("SELECT * FROM t", "mysql", 50, 10)
        );
    }
}
