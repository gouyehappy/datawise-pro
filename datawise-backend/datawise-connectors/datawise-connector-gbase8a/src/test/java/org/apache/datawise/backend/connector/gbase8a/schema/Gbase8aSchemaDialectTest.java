package org.apache.datawise.backend.connector.gbase8a.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.mysql.schema.MysqlForkSchemaDialect;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class Gbase8aSchemaDialectTest {

    private final MysqlForkSchemaDialect dialect = new MysqlForkSchemaDialect(DbType.GBASE8A);

    @Test
    void filtersSystemCatalogs() {
        assertTrue(dialect.isSystemCatalog("information_schema"));
        assertFalse(dialect.isSystemCatalog("sales"));
    }
}
