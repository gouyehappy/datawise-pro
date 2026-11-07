package org.apache.datawise.backend.connector.kylin.schema;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KylinSchemaDialectTest {

    @Test
    void supportsKylin() {
        KylinSchemaDialect dialect = new KylinSchemaDialect();
        assertTrue(dialect.supports("kylin"));
        assertFalse(dialect.supports("trino"));
    }

    @Test
    void treatsBlankCatalogAsSystem() {
        KylinSchemaDialect dialect = new KylinSchemaDialect();
        assertTrue(dialect.isSystemCatalog(null));
        assertTrue(dialect.isSystemCatalog(""));
        assertFalse(dialect.isSystemCatalog("learn_kylin"));
    }
}
