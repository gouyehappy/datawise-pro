package org.apache.datawise.backend.connector.oracle.schema;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OracleSchemaDialectTest {

    private final OracleSchemaDialect dialect = new OracleSchemaDialect();

    @Test
    void filtersSystemSchemas() {
        assertTrue(dialect.isSystemSchema("SYS"));
        assertTrue(dialect.isSystemSchema("CTXSYS"));
        assertTrue(dialect.isSystemSchema("APEX_040000"));
        assertFalse(dialect.isSystemSchema("HR"));
    }

    @Test
    void resolveScope_mapsExplorerNodeToJdbcSchemaPattern() throws Exception {
        var scope = dialect.resolveScope(null, "HR");
        assertEquals(null, scope.catalogPattern());
        assertEquals("HR", scope.schemaPattern());
        assertEquals("HR", scope.displayCatalog());
    }

    @Test
    void resolveScope_withExplicitSchema_usesOwnerOnly() throws Exception {
        var scope = dialect.resolveScope(null, null, "SCOTT");
        assertEquals(null, scope.catalogPattern());
        assertEquals("SCOTT", scope.schemaPattern());
        assertEquals("SCOTT", scope.displayCatalog());
    }
}
