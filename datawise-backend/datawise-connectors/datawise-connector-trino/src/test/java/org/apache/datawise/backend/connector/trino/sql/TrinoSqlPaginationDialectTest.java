package org.apache.datawise.backend.connector.trino.sql;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TrinoSqlPaginationDialectTest {

    private final TrinoSqlPaginationDialect dialect = new TrinoSqlPaginationDialect();

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
    void supports_trinoOnly() {
        assert dialect.supports("trino");
        assert !dialect.supports("presto");
    }
}
