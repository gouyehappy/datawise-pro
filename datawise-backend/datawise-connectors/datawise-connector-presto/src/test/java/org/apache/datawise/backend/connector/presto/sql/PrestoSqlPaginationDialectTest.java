package org.apache.datawise.backend.connector.presto.sql;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PrestoSqlPaginationDialectTest {

    private final PrestoSqlPaginationDialect dialect = new PrestoSqlPaginationDialect();

    @Test
    void applyLimitOffset_usesLimitOnlyWhenOffsetZero() {
        String sql = "SELECT * FROM \"hive\".\"a003\".\"users\"";
        assertEquals(
                "SELECT * FROM \"hive\".\"a003\".\"users\" LIMIT 501",
                dialect.applyLimitOffset(sql, 501, 0)
        );
    }

    @Test
    void applyLimitOffset_usesOffsetBeforeLimitWhenOffsetPositive() {
        String sql = "SELECT * FROM \"hive\".\"a003\".\"users\"";
        assertEquals(
                "SELECT * FROM \"hive\".\"a003\".\"users\" OFFSET 100 LIMIT 501",
                dialect.applyLimitOffset(sql, 501, 100)
        );
    }

    @Test
    void supports_prestoAndPresto() {
        assert dialect.supports("presto");
        assert dialect.supports("presto");
    }
}
