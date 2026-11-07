package org.apache.datawise.backend.schema;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CatalogSchemaScopeTest {

    @Test
    void parse_splitsCatalogAndSchema() {
        CatalogSchemaScope scope = CatalogSchemaScope.parse("hive.a003");
        assertEquals("hive", scope.catalog());
        assertEquals("a003", scope.schema());
        assertTrue(scope.hasSchema());
    }

    @Test
    void parse_returnsCatalogOnlyWhenNoDot() {
        CatalogSchemaScope scope = CatalogSchemaScope.parse("hive");
        assertEquals("hive", scope.catalog());
        assertFalse(scope.hasSchema());
    }

    @Test
    void instanceKey_usesCatalogDotSchemaForTrino() {
        assertEquals("hive.a003", CatalogSchemaScope.parse("hive.a003").instanceKey());
        assertEquals("admin_db", CatalogSchemaScope.parse("admin_db").instanceKey());
        assertEquals("hive.a003", CatalogSchemaScope.formatInstanceKey("hive", "a003"));
    }
}
