package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.common.DbType;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** SQL Server catalog/schema switching and table qualification helpers. */
public final class SqlServerCatalogSupport {

    private static final Set<String> SYSTEM_SCHEMAS = Set.of(
            "information_schema",
            "sys",
            "guest",
            "db_owner",
            "db_accessadmin",
            "db_securityadmin",
            "db_ddladmin",
            "db_backupoperator",
            "db_datareader",
            "db_datawriter",
            "db_denydatareader",
            "db_denydatawriter"
    );

    private SqlServerCatalogSupport() {
    }

    public static boolean isSystemSchema(String schema) {
        return schema != null && SYSTEM_SCHEMAS.contains(schema.toLowerCase(Locale.ROOT));
    }

    /**
     * Switches database context ({@code USE [catalog]}).
     * Always executes {@code USE} — JDBC {@link Connection#getCatalog()} is unreliable on SQL Server pools.
     */
    public static void applyCatalog(Connection connection, String catalog) throws SQLException {
        if (connection == null || catalog == null || catalog.isBlank()) {
            return;
        }
        String quoted = DbType.SQLSERVER.quoteName(catalog.trim());
        try (Statement statement = connection.createStatement()) {
            statement.execute("USE " + quoted);
        }
    }

    public static String defaultSchema(Connection connection) throws SQLException {
        String current = connection != null ? connection.getSchema() : null;
        return current != null && !current.isBlank() ? current.trim() : "dbo";
    }

    public static List<String> listUserSchemaNames(Connection connection, String catalog) throws SQLException {
        applyCatalog(connection, catalog);
        List<String> schemas = new ArrayList<>();
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SELECT name FROM sys.schemas ORDER BY name")) {
            while (rs.next()) {
                String name = rs.getString(1);
                if (name == null || name.isBlank() || isSystemSchema(name)) {
                    continue;
                }
                schemas.add(name.trim());
            }
        }
        if (schemas.isEmpty()) {
            schemas.add(defaultSchema(connection));
        }
        return schemas;
    }

    /**
     * Explorer metadata listers: {@code catalog} + optional {@code schema} with {@code USE [catalog]} applied.
     */
    public static SqlServerMetadataScope resolveListingScope(
            Connection connection,
            String catalog,
            String schema
    ) throws SQLException {
        String database = schema != null && !schema.isBlank()
                ? qualifyDatabase(catalog, schema)
                : catalog;
        SqlServerMetadataScope scope = SqlServerMetadataScope.parse(database);
        if (!scope.hasCatalog()) {
            throw new IllegalArgumentException("SQL Server catalog (database) is required");
        }
        scope.apply(connection);
        return scope.withResolvedSchema(connection);
    }

    /**
     * Table/view metadata: API {@code database} scope (e.g. {@code mydb.dbo}) with catalog fallback and relation hint.
     */
    public static SqlServerMetadataScope resolveRelationScope(
            Connection connection,
            String database,
            String fallbackCatalog,
            String relationName,
            boolean viewHint
    ) throws SQLException {
        SqlServerMetadataScope scope = SqlServerMetadataScope.parse(database);
        if (!scope.hasCatalog() && fallbackCatalog != null && !fallbackCatalog.isBlank()) {
            scope = new SqlServerMetadataScope(fallbackCatalog.trim(), scope.schema());
        }
        scope.apply(connection);
        if (scope.hasSchema()) {
            return scope;
        }
        String resolvedSchema = resolveRelationSchema(connection, relationName, viewHint);
        return new SqlServerMetadataScope(scope.catalog(), resolvedSchema);
    }

    public static String resolveTableSchema(Connection connection, String relationName) throws SQLException {
        return resolveRelationSchema(connection, relationName, false);
    }

    public static String resolveRelationSchema(Connection connection, String relationName, boolean view)
            throws SQLException {
        if (connection == null || relationName == null || relationName.isBlank()) {
            return "dbo";
        }
        String objectType = view ? "V" : "U";
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT TOP 1 s.name
                FROM sys.objects o
                INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
                WHERE o.name = ? AND o.type = ?
                ORDER BY CASE WHEN s.name = 'dbo' THEN 0 ELSE 1 END, s.name
                """)) {
            ps.setString(1, relationName.trim());
            ps.setString(2, objectType);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    String schema = rs.getString(1);
                    if (schema != null && !schema.isBlank()) {
                        return schema.trim();
                    }
                }
            }
        }
        return "dbo";
    }

    public static String qualifyDatabase(String catalog, String schema) {
        if (catalog == null || catalog.isBlank()) {
            return schema != null && !schema.isBlank() ? schema.trim() : "";
        }
        if (schema == null || schema.isBlank()) {
            return catalog.trim();
        }
        return catalog.trim() + "." + schema.trim();
    }

    public static String qualifyTable(Connection connection, String database, String tableName) throws SQLException {
        return qualifyTable(connection, database, tableName, false);
    }

    public static String qualifyTable(
            Connection connection,
            String database,
            String tableName,
            boolean view
    ) throws SQLException {
        SqlServerMetadataScope scope = resolveRelationScope(connection, database, null, tableName, view);
        return DbType.quoteQualifiedTable(
                DbType.SQLSERVER.id(),
                qualifyDatabase(scope.catalog(), scope.schema()),
                tableName
        );
    }
}
