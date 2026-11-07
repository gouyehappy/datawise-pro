package org.apache.datawise.backend.connector.clickhouse.dml;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ClickHouseFamilyDmlDialectTest {

    private final ClickHouseFamilyDmlDialect dialect = new ClickHouseFamilyDmlDialect();

    @Test
    void supportsClickHouse() {
        assertTrue(dialect.supports("clickhouse"));
    }

    @Test
    void qualifiedTable_usesDatabaseQualifiedNames() {
        assertEquals(
                "`default`.`events`",
                dialect.qualifiedTable("default", "events")
        );
    }

    @Test
    void quoteIdentifier_usesBackticks() {
        assertEquals("`user_id`", dialect.quoteIdentifier("user_id"));
    }
}
