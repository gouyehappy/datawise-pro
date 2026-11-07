package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Locale;

/** Shared catalog/schema scope resolution for Explorer metadata listers. */
public final class JdbcSchemaListingScopes {

    private JdbcSchemaListingScopes() {
    }

    public static void prepareCatalogConnection(
                                                Connection connection,
                                                String catalog,
                                                String dbType,
                                                SchemaDialect dialect) throws SQLException {
        if (dialect != null) {
            dialect.prepareCatalogConnection(connection, catalog);
        }
    }

    public static boolean isSystemSchema(String dbType, SchemaDialect dialect, String schema) {
        return dialect != null && dialect.isSystemSchema(schema);
    }

    public static SchemaScope resolveScope(
                                           Connection connection,
                                           String catalog,
                                           String schema,
                                           String dbType,
                                           SchemaDialectRegistry dialectRegistry) throws SQLException {
        SchemaDialect dialect = dialectRegistry.resolve(dbType);
        if (!ExplorerSchemaFilter.isUserScope(dialect, dbType, catalog, schema)) {
            return null;
        }
        if (schema != null && !schema.isBlank() && isSystemSchema(dbType, dialect, schema)) {
            return null;
        }
        prepareCatalogConnection(connection, catalog, dbType, dialect);
        return schema != null && !schema.isBlank()
                ? dialect.resolveScope(connection, catalog, schema)
                : dialect.resolveScope(connection, catalog);
    }

    /** Prefer non-blank schema, else catalog (trimmed); empty string when both missing. */
    public static String preferSchemaElseCatalog(String catalog, String schema) {
        if (schema != null && !schema.isBlank()) {
            return schema.trim();
        }
        return catalog != null ? catalog.trim() : "";
    }

    public static String resolveMysqlSchemaName(String catalog, String schema, SchemaScope scope) {
        String preferred = preferSchemaElseCatalog(catalog, schema);
        if (!preferred.isBlank()) {
            return preferred;
        }
        if (scope.catalogPattern() != null && !"%".equals(scope.catalogPattern())) {
            return scope.catalogPattern();
        }
        return catalog;
    }

    public static String resolvePgSchema(SchemaScope scope, Connection connection) throws SQLException {
        if (scope.schemaPattern() != null && !scope.schemaPattern().isBlank() && !"%".equals(scope.schemaPattern())) {
            return scope.schemaPattern();
        }
        String current = connection.getSchema();
        return current != null && !current.isBlank() ? current : "public";
    }

    public static String resolveSqlServerSchemaName(String schema, SchemaScope scope) {
        if (schema != null && !schema.isBlank()) {
            return schema.trim();
        }
        if (scope.schemaPattern() != null && !scope.schemaPattern().isBlank() && !"%".equals(scope.schemaPattern())) {
            return scope.schemaPattern();
        }
        return "dbo";
    }

    /**
     * Uppercased owner/schema for Oracle-family table paging and DB2 SYSCAT binds.
     * Includes catalog, scope pattern, and connection/user fallbacks — not used by
     * Explorer view/routine dictionary listing (see {@code OracleFamilyDictionaryListing}).
     */
    public static String resolveOracleOwner(
                                            String catalog,
                                            String schema,
                                            SchemaScope scope,
                                            Connection connection) throws SQLException {
        if (schema != null && !schema.isBlank()) {
            return schema.trim().toUpperCase(Locale.ROOT);
        }
        if (catalog != null && !catalog.isBlank()) {
            return catalog.trim().toUpperCase(Locale.ROOT);
        }
        if (scope.schemaPattern() != null && !scope.schemaPattern().isBlank() && !"%".equals(scope.schemaPattern())) {
            return scope.schemaPattern().trim().toUpperCase(Locale.ROOT);
        }
        String current = connection.getSchema();
        if (current != null && !current.isBlank()) {
            return current.trim().toUpperCase(Locale.ROOT);
        }
        String user = connection.getMetaData().getUserName();
        return user != null ? user.trim().toUpperCase(Locale.ROOT) : "";
    }

    /** Same algorithm as {@link #resolveOracleOwner}; kept for call-site clarity at DB2 binders. */
    public static String resolveDb2SchemaName(
                                              String catalog,
                                              String schema,
                                              SchemaScope scope,
                                              Connection connection) throws SQLException {
        return resolveOracleOwner(catalog, schema, scope, connection);
    }
}
