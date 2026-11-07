package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.SchemaScope;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Filters engine-internal catalogs/schemas from explorer tree nodes. */
public final class ExplorerSchemaFilter {

    private ExplorerSchemaFilter() {
    }

    public static boolean isUserCatalog(SchemaDialect dialect, String dbType, String catalogLabel) {
        if (catalogLabel == null || catalogLabel.isBlank()) {
            return false;
        }
        if (DbType.isPostgresqlFamily(dbType) || DbType.isSchemaRootFamily(dbType)) {
            return !dialect.isSystemSchema(catalogLabel);
        }
        return !dialect.isSystemCatalog(catalogLabel);
    }

    /** JDBC table/view listing scope: schema-root families may pass owner only via {@code schema}. */
    public static boolean isUserScope(SchemaDialect dialect, String dbType, String catalogLabel, String schemaLabel) {
        if (DbType.isSchemaRootFamily(dbType)) {
            String owner = schemaLabel != null && !schemaLabel.isBlank() ? schemaLabel : catalogLabel;
            return owner != null && !owner.isBlank() && !dialect.isSystemSchema(owner);
        }
        if (schemaLabel != null && !schemaLabel.isBlank() && isSystemSchema(dbType, dialect, schemaLabel)) {
            return false;
        }
        return isUserCatalog(dialect, dbType, catalogLabel);
    }

    public static List<TreeNode> filterDatabaseRoots(
                                                     List<TreeNode> nodes,
                                                     String dbType,
                                                     SchemaDialectRegistry dialectRegistry) {
        if (nodes == null || nodes.isEmpty()) {
            return List.of();
        }
        SchemaDialect dialect = dialectRegistry.resolve(dbType);
        List<TreeNode> filtered = new ArrayList<>(nodes.size());
        for (TreeNode node : nodes) {
            if ("database".equals(node.getType())
                    && !isUserCatalog(dialect, dbType, node.getLabel())) {
                continue;
            }
            filtered.add(node);
        }
        return filtered;
    }

    /** Connection root nodes: filter system catalogs and legacy Trino scripts folder. */
    public static List<TreeNode> filterConnectionRoots(
                                                       List<TreeNode> nodes,
                                                       String dbType,
                                                       SchemaDialectRegistry dialectRegistry) {
        List<TreeNode> filtered = filterDatabaseRoots(nodes, dbType, dialectRegistry);
        if (!DbType.isCatalogSchemaFamily(dbType)) {
            return filtered;
        }
        List<TreeNode> withoutScripts = new ArrayList<>(filtered.size());
        for (TreeNode node : filtered) {
            if (isConnectionScriptsFolder(node)) {
                continue;
            }
            withoutScripts.add(node);
        }
        return withoutScripts;
    }

    static boolean isConnectionScriptsFolder(TreeNode node) {
        return "folder".equals(node.getType())
                && node.getLabel() != null
                && "scripts".equalsIgnoreCase(node.getLabel());
    }

    public static boolean matchesTableScope(SchemaScope scope, String tableCatalog, String tableSchema) {
        if (scope.schemaPattern() != null && !scope.schemaPattern().isBlank()) {
            String expectedSchema = scope.schemaPattern();
            if (!"%".equals(expectedSchema)
                    && (tableSchema == null || !tableSchema.equalsIgnoreCase(expectedSchema))) {
                return false;
            }
        }
        if (scope.catalogPattern() != null && !scope.catalogPattern().isBlank()) {
            String expectedCatalog = scope.catalogPattern();
            if (!"%".equals(expectedCatalog)
                    && tableCatalog != null
                    && !tableCatalog.equalsIgnoreCase(expectedCatalog)) {
                return false;
            }
        }
        return true;
    }

    public static boolean isSystemSchema(String dbType, SchemaDialect dialect, String schema) {
        return dialect != null && dialect.isSystemSchema(schema);
    }

    public static String normalizeIdentifier(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }

    /**
     * SQL Server / Trino / Hive catalog nodes should list schema children, not tables/views folders.
     * Legacy schema cache may still have folders directly under database.
     */
    public static boolean hasStaleCatalogSchemaChildren(String dbType, TreeNode databaseNode, List<TreeNode> children) {
        if (databaseNode == null || !"database".equals(databaseNode.getType())) {
            return false;
        }
        if (!DbType.usesCatalogSchemaInstanceKey(dbType)) {
            return false;
        }
        if (children == null || children.isEmpty()) {
            return false;
        }
        if (children.stream().anyMatch(child -> child != null && "schema".equals(child.getType()))) {
            return false;
        }
        return children.stream().anyMatch(child -> child != null && "folder".equals(child.getType()));
    }
}
