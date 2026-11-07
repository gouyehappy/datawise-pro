package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.schema.GenericSchemaDialect;
import org.apache.datawise.backend.schema.JdbcSchemaExplorerRegistry;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.introspect.oracle.OracleFamilyDictionaryListing;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Guards the intentional split between Oracle table paging owners and dictionary view/routine owners.
 * Do not "unify" these paths without an Explorer product decision.
 */
class OracleOwnerResolutionDivergenceTest {

    @Test
    void tablePaging_prefersScopeSchemaPatternBeforeCatalog_whenSchemaArgumentBlank() throws SQLException {
        Connection connection = mock(Connection.class);
        PreparedStatement tablePs = mock(PreparedStatement.class);
        PreparedStatement viewPs = mock(PreparedStatement.class);
        ResultSet empty = mock(ResultSet.class);
        when(connection.prepareStatement(contains("all_tables"))).thenReturn(tablePs);
        when(connection.prepareStatement(contains("all_views"))).thenReturn(viewPs);
        when(tablePs.executeQuery()).thenReturn(empty);
        when(viewPs.executeQuery()).thenReturn(empty);
        when(empty.next()).thenReturn(false);

        JdbcTableLister lister = tableLister(new ScopePatternOverridesCatalogDialect());

        // Dialect returns schemaPattern=SCOPED when only catalog is supplied.
        lister.listTablesPage(connection, "conn-1", "catalog_owner", null, "oracle", 0, 10, true, null);
        // Dictionary for the same catalog/schema labels uses catalog as owner.
        OracleFamilyDictionaryListing.listViews(connection, "conn-1", "catalog_owner", null);

        verify(tablePs).setString(1, "SCOPED");
        verify(viewPs).setString(1, "CATALOG_OWNER");
    }

    @Test
    void dictionary_doesNotQueryWhenTablePagingWouldStillResolveViaConnection() throws SQLException {
        Connection connection = mock(Connection.class);
        when(connection.getSchema()).thenReturn("conn_owner");

        assertEquals(
                "CONN_OWNER",
                JdbcSchemaListingScopes.resolveOracleOwner(
                        null, null, new SchemaScope(null, "%", "x"), connection));

        assertTrue(OracleFamilyDictionaryListing.listViews(connection, "conn-1", null, null).isEmpty());
        verify(connection, never()).prepareStatement(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void bothPaths_agreeWhenExplicitSchemaIsPresent() throws SQLException {
        Connection connection = mock(Connection.class);
        PreparedStatement tablePs = mock(PreparedStatement.class);
        PreparedStatement viewPs = mock(PreparedStatement.class);
        ResultSet empty = mock(ResultSet.class);
        when(connection.prepareStatement(contains("all_tables"))).thenReturn(tablePs);
        when(connection.prepareStatement(contains("all_views"))).thenReturn(viewPs);
        when(tablePs.executeQuery()).thenReturn(empty);
        when(viewPs.executeQuery()).thenReturn(empty);
        when(empty.next()).thenReturn(false);

        JdbcTableLister lister = tableLister(new ScopePatternOverridesCatalogDialect());

        lister.listTablesPage(connection, "conn-1", "catalog_owner", "hr", "oracle", 0, 10, true, null);
        OracleFamilyDictionaryListing.listViews(connection, "conn-1", "catalog_owner", "hr");

        verify(tablePs).setString(1, "HR");
        verify(viewPs).setString(1, "HR");
    }

    private static JdbcTableLister tableLister(SchemaDialect dialect) {
        return new JdbcTableLister(
                new SchemaDialectRegistry(
                        List.of(dialect),
                        new GenericSchemaDialect(),
                        new ConnectorPluginContributionHolder()),
                new SchemaTreeBuilder(),
                new JdbcSchemaExplorerRegistry(List.of(), new ConnectorPluginContributionHolder()));
    }

    /**
     * When Explorer expands a catalog node without an explicit schema argument,
     * this dialect surfaces a distinct scope schemaPattern — exposing table-vs-dictionary divergence.
     */
    private static final class ScopePatternOverridesCatalogDialect implements SchemaDialect {

        @Override
        public String id() {
            return DbType.ORACLE.id();
        }

        @Override
        public boolean supports(String dbType) {
            return DbType.ORACLE.matches(dbType);
        }

        @Override
        public SchemaScope resolveScope(Connection connection, String catalogLabel) {
            return new SchemaScope(null, "scoped", catalogLabel);
        }

        @Override
        public SchemaScope resolveScope(Connection connection, String catalog, String schema) {
            String owner = schema != null && !schema.isBlank() ? schema : "scoped";
            return new SchemaScope(null, owner, owner);
        }
    }
}
