package org.apache.datawise.backend.connector.sqlserver.schema;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlServerSchemaDialectTest {

    private final SqlServerSchemaDialect dialect = new SqlServerSchemaDialect();

    @Test
    void filtersSystemCatalogs() {
        assertTrue(dialect.isSystemCatalog("master"));
        assertFalse(dialect.isSystemCatalog("AdventureWorks"));
    }

    @Test
    void filtersSystemSchemas() {
        assertTrue(dialect.isSystemSchema("sys"));
        assertTrue(dialect.isSystemSchema("INFORMATION_SCHEMA"));
        assertFalse(dialect.isSystemSchema("dbo"));
    }

    @Test
    void usesCatalogSchemaHierarchy() {
        assertTrue(dialect.usesCatalogSchemaHierarchy());
    }
}
