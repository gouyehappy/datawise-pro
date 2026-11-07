package org.apache.datawise.backend.connector.hive.sql;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class HiveSqlPaginationDialectTest {

    private final HiveSqlPaginationDialect dialect = new HiveSqlPaginationDialect();

    @Test
    void applyLimitOffset_usesLimitOnlyWhenOffsetZero() {
        String sql = "SELECT * FROM `default`.`users`";
        assertEquals(
                "SELECT * FROM `default`.`users` LIMIT 501",
                dialect.applyLimitOffset(sql, 501, 0)
        );
    }

    @Test
    void applyLimitOffset_usesLimitOffsetWhenOffsetPositive() {
        String sql = "SELECT * FROM `default`.`users`";
        assertEquals(
                "SELECT * FROM `default`.`users` LIMIT 501 OFFSET 100",
                dialect.applyLimitOffset(sql, 501, 100)
        );
    }

    @Test
    void supports_hiveOnly() {
        assert dialect.supports("hive");
    }
}
