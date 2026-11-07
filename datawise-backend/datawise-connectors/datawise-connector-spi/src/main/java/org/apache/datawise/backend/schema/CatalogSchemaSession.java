package org.apache.datawise.backend.schema;

import java.sql.Connection;
import java.sql.SQLException;

/** Applies {@link CatalogSchemaScope} to a JDBC connection (catalog switch + default schema). */
public final class CatalogSchemaSession {

    @FunctionalInterface
    public interface CatalogSwitcher {

        void apply(Connection connection, String catalog) throws SQLException;
    }

    private CatalogSchemaSession() {
    }

    public static void apply(
                             Connection connection,
                             CatalogSchemaScope scope,
                             CatalogSwitcher catalogSwitcher) throws SQLException {
        if (scope.catalog() != null && !scope.catalog().isBlank()) {
            catalogSwitcher.apply(connection, scope.catalog());
        }
        if (scope.hasSchema()) {
            connection.setSchema(scope.schema());
        }
    }

    public static boolean isApplied(Connection connection, CatalogSchemaScope scope) throws SQLException {
        if (scope.catalog() != null && !scope.catalog().isBlank()
                && !equalsIgnoreCase(scope.catalog(), connection.getCatalog())) {
            return false;
        }
        if (scope.hasSchema() && !equalsIgnoreCase(scope.schema(), connection.getSchema())) {
            return false;
        }
        return true;
    }

    private static boolean equalsIgnoreCase(String expected, String actual) {
        if (expected == null) {
            return actual == null;
        }
        return actual != null && expected.equalsIgnoreCase(actual);
    }
}
