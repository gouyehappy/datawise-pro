package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.schema.SchemaScope;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Scope helpers used by table paging / metadata — including Oracle-family owner fallbacks
 * that are intentionally richer than dictionary view/routine listing.
 */
class JdbcSchemaListingScopesTest {

    @Test
    void preferSchemaElseCatalog_trimsAndFallsBack() {
        assertEquals("sales", JdbcSchemaListingScopes.preferSchemaElseCatalog("db1", " sales "));
        assertEquals("db1", JdbcSchemaListingScopes.preferSchemaElseCatalog("db1", null));
        assertEquals("db1", JdbcSchemaListingScopes.preferSchemaElseCatalog(" db1 ", "  "));
        assertEquals("", JdbcSchemaListingScopes.preferSchemaElseCatalog(null, null));
    }

    @Test
    void resolveOracleOwner_prefersSchemaThenCatalogThenScopeThenConnectionThenUser() throws SQLException {
        Connection connection = mock(Connection.class);
        DatabaseMetaData meta = mock(DatabaseMetaData.class);
        when(connection.getSchema()).thenReturn("conn_schema");
        when(connection.getMetaData()).thenReturn(meta);
        when(meta.getUserName()).thenReturn("db_user");

        SchemaScope scope = new SchemaScope(null, "scoped_owner", "display");

        assertEquals("EXPLICIT", JdbcSchemaListingScopes.resolveOracleOwner(
                "catalog_owner", "explicit", scope, connection));
        assertEquals("CATALOG_OWNER", JdbcSchemaListingScopes.resolveOracleOwner(
                "catalog_owner", null, scope, connection));
        assertEquals("SCOPED_OWNER", JdbcSchemaListingScopes.resolveOracleOwner(
                null, null, scope, connection));
        assertEquals("CONN_SCHEMA", JdbcSchemaListingScopes.resolveOracleOwner(
                null, null, new SchemaScope(null, "%", "display"), connection));

        when(connection.getSchema()).thenReturn(null);
        assertEquals("DB_USER", JdbcSchemaListingScopes.resolveOracleOwner(
                null, null, new SchemaScope(null, null, "display"), connection));
    }

    @Test
    void resolveDb2SchemaName_isAliasOfResolveOracleOwner() throws SQLException {
        Connection connection = mock(Connection.class);
        SchemaScope scope = new SchemaScope(null, "app", "app");

        assertEquals(
                JdbcSchemaListingScopes.resolveOracleOwner("c", "s", scope, connection),
                JdbcSchemaListingScopes.resolveDb2SchemaName("c", "s", scope, connection));
        assertEquals(
                JdbcSchemaListingScopes.resolveOracleOwner(null, null, scope, connection),
                JdbcSchemaListingScopes.resolveDb2SchemaName(null, null, scope, connection));
    }

    @Test
    void resolveOracleOwner_catalogBeatsScopePattern_whenSchemaBlank() throws SQLException {
        Connection connection = mock(Connection.class);
        SchemaScope scope = new SchemaScope(null, "scoped_owner", "display");

        assertEquals(
                "CATALOG_X",
                JdbcSchemaListingScopes.resolveOracleOwner("catalog_x", null, scope, connection));
    }
}
