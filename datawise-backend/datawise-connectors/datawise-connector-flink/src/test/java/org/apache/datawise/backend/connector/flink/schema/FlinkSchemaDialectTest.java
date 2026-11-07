package org.apache.datawise.backend.connector.flink.schema;

import org.apache.datawise.backend.schema.SchemaScope;
import org.junit.jupiter.api.Test;

import java.sql.Connection;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FlinkSchemaDialectTest {

    private final FlinkSchemaDialect dialect = new FlinkSchemaDialect();

    @Test
    void supportsFlinkOnly() {
        assertTrue(dialect.supports("flink"));
        assertFalse(dialect.supports("trino"));
        assertFalse(dialect.supports("mysql"));
    }

    @Test
    void isSystemCatalog_filtersEngineCatalogs() {
        assertTrue(dialect.isSystemCatalog("system"));
        assertTrue(dialect.isSystemCatalog("JMX"));
        assertFalse(dialect.isSystemCatalog("hive"));
    }

    @Test
    void resolveScope_usesConnectionSchemaOrWildcard() throws Exception {
        Connection withSchema = mock(Connection.class);
        when(withSchema.getSchema()).thenReturn("analytics");
        assertEquals("analytics", dialect.resolveScope(withSchema, "hive").schemaPattern());

        Connection withoutSchema = mock(Connection.class);
        when(withoutSchema.getSchema()).thenReturn(null);
        assertEquals("%", dialect.resolveScope(withoutSchema, "hive").schemaPattern());
    }

    @Test
    void resolveScope_withExplicitSchema() throws Exception {
        Connection connection = mock(Connection.class);
        SchemaScope scope = dialect.resolveScope(connection, "hive", "default");
        assertEquals("hive", scope.catalogPattern());
        assertEquals("default", scope.schemaPattern());
    }

    @Test
    void usesCatalogSchemaHierarchy() {
        assertTrue(dialect.usesCatalogSchemaHierarchy());
    }
}
