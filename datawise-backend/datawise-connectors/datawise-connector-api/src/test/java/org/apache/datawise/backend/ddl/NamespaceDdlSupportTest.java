package org.apache.datawise.backend.ddl;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NamespaceDdlSupportTest {

    @Test
    void buildsMysqlCreateDatabaseWithCharsetAndCollation() {
        String sql = NamespaceDdlSupport.buildCreateDatabaseSql(
                "mysql",
                "test",
                "utf8mb4",
                "utf8mb4_general_ci");
        assertEquals(
                "CREATE DATABASE `test` CHARACTER SET 'utf8mb4' COLLATE 'utf8mb4_general_ci'",
                sql);
    }

    @Test
    void buildsPostgresqlCreateDatabase() {
        assertEquals(
                "CREATE DATABASE \"analytics\"",
                NamespaceDdlSupport.buildCreateDatabaseSql("postgresql", "analytics", null, null));
    }

    @Test
    void buildsCreateSchemaForPostgresqlAndCatalogFamily() {
        assertEquals(
                "CREATE SCHEMA \"app\"",
                NamespaceDdlSupport.buildCreateSchemaSql("postgresql", "app", null));
        assertEquals(
                "CREATE SCHEMA \"hive\".\"reporting\"",
                NamespaceDdlSupport.buildCreateSchemaSql("trino", "reporting", "hive"));
    }

    @Test
    void capabilityFlags() {
        assertTrue(NamespaceDdlSupport.supportsCreateDatabase("mysql"));
        assertTrue(NamespaceDdlSupport.supportsCreateDatabase("postgresql"));
        assertFalse(NamespaceDdlSupport.supportsCreateDatabase("oracle"));
        assertFalse(NamespaceDdlSupport.supportsCreateDatabase("redis"));
        assertTrue(NamespaceDdlSupport.supportsCreateSchema("postgresql"));
        assertTrue(NamespaceDdlSupport.supportsCreateSchema("trino"));
        assertFalse(NamespaceDdlSupport.supportsCreateSchema("mysql"));
        assertTrue(NamespaceDdlSupport.supportsMysqlCharsetOptions("mariadb"));
        assertFalse(NamespaceDdlSupport.supportsMysqlCharsetOptions("postgresql"));
    }

    @Test
    void rejectsBlankName() {
        assertThrows(
                IllegalArgumentException.class,
                () -> NamespaceDdlSupport.buildCreateDatabaseSql("mysql", "  ", null, null));
    }
}
