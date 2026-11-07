package org.apache.datawise.backend.connector.clickhouse.schema;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ClickHouseSchemaDialectTest {

    private final ClickHouseSchemaDialect dialect = new ClickHouseSchemaDialect();

    @Test
    void filtersSystemDatabases() {
        assertTrue(dialect.isSystemCatalog("system"));
        assertTrue(dialect.isSystemCatalog("INFORMATION_SCHEMA"));
        assertFalse(dialect.isSystemCatalog("default"));
    }
}
