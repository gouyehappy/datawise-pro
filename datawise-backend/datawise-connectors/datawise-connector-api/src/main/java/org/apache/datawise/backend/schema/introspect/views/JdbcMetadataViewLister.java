package org.apache.datawise.backend.schema.introspect.views;

import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.introspect.ExplorerSchemaFilter;
import org.apache.datawise.backend.schema.introspect.JdbcSchemaListingScopes;
import org.apache.datawise.backend.schema.spi.JdbcSchemaViewLister;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** JDBC {@link DatabaseMetaData#getTables()} view fallback. */
@Component
public final class JdbcMetadataViewLister implements JdbcSchemaViewLister {

    private static final String[] JDBC_VIEW_TYPES = {"VIEW", "VIRTUAL_VIEW", "MATERIALIZED_VIEW"};

    private final SchemaDialectRegistry dialectRegistry;

    public JdbcMetadataViewLister(SchemaDialectRegistry dialectRegistry) {
        this.dialectRegistry = dialectRegistry;
    }

    @Override
    public boolean supports(String dbType) {
        return true;
    }

    @Override
    public int priority() {
        return 1000;
    }

    @Override
    public List<TreeNode> listViews(
                                    Connection connection,
                                    String connectionId,
                                    String catalog,
                                    String schema,
                                    String dbType) throws SQLException {
        SchemaScope scope = JdbcSchemaListingScopes.resolveScope(
                connection, catalog, schema, dbType, dialectRegistry);
        if (scope == null) {
            return List.of();
        }
        DatabaseMetaData meta = connection.getMetaData();
        for (String[] probe : metadataProbes(scope)) {
            List<String> names = collectMetadataViewNames(meta, probe[0], probe[1], scope);
            if (!names.isEmpty()) {
                return JdbcViewListingSupport.toViewNodes(connectionId, catalog, schema, names);
            }
        }
        return List.of();
    }

    private static String[][] metadataProbes(SchemaScope scope) {
        String catalog = scope.catalogPattern();
        String schema = scope.schemaPattern();
        if (schema != null && !schema.isBlank() && !"%".equals(schema)) {
            return new String[][]{{null, schema.trim()}, {catalog, schema.trim()}};
        }
        if (catalog != null && !catalog.isBlank() && !"%".equals(catalog)) {
            return new String[][]{
                    {null, catalog.trim()},
                    {catalog.trim(), "%"},
                    {catalog.trim(), null},
            };
        }
        return new String[][]{{null, "%"}};
    }

    private static List<String> collectMetadataViewNames(
                                                         DatabaseMetaData meta,
                                                         String catalogPattern,
                                                         String schemaPattern,
                                                         SchemaScope filterScope) throws SQLException {
        Set<String> names = new LinkedHashSet<>();
        try (ResultSet rs = meta.getTables(catalogPattern, schemaPattern, "%", JDBC_VIEW_TYPES)) {
            while (rs.next()) {
                String viewName = resultString(rs, "TABLE_NAME", "table_name");
                if (viewName == null || viewName.isBlank()) {
                    continue;
                }
                String tableCatalog = resultString(rs, "TABLE_CAT", "table_cat");
                String tableSchema = resultString(rs, "TABLE_SCHEM", "table_schem");
                if (!ExplorerSchemaFilter.matchesTableScope(filterScope, tableCatalog, tableSchema)) {
                    continue;
                }
                names.add(viewName);
            }
        }
        return List.copyOf(names);
    }

    private static String resultString(ResultSet rs, String... labels) throws SQLException {
        for (String label : labels) {
            try {
                String value = rs.getString(label);
                if (value != null) {
                    return value;
                }
            } catch (SQLException ignored) {
                // try next label
            }
        }
        return null;
    }
}
