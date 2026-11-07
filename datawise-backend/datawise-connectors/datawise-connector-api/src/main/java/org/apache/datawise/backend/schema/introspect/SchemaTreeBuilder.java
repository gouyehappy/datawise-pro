package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.TableMetadataLoader;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Builds explorer tree nodes for databases, tables, and columns. */
public final class SchemaTreeBuilder {

    public TreeNode buildDatabaseNode(String connectionId, String catalog, List<TreeNode> tableNodes) {
        TreeNode database = new TreeNode();
        database.setId(SchemaNodeIds.nodeId("db", connectionId, catalog));
        database.setLabel(catalog);
        database.setType("database");
        database.setExpanded(false);
        database.setChildren(buildDatabaseChildren(connectionId, catalog, tableNodes));
        return database;
    }

    /** Trino / Presto catalog 节点：子级 schema 懒加载，不预置 tables 文件夹。 */
    public TreeNode buildCatalogNode(String connectionId, String catalog) {
        TreeNode catalogNode = new TreeNode();
        catalogNode.setId(SchemaNodeIds.nodeId("db", connectionId, catalog));
        catalogNode.setLabel(catalog);
        catalogNode.setType("database");
        catalogNode.setExpanded(false);
        catalogNode.setChildren(new ArrayList<>());
        return catalogNode;
    }

    public List<TreeNode> buildDatabaseChildren(String connectionId, String catalog, List<TreeNode> tableNodes) {
        List<TreeNode> folders = new ArrayList<>();
        TreeNode tables = folderNode("tables", connectionId, catalog, "folder-tables");
        tables.setChildren(new ArrayList<>(tableNodes));
        tables.setChildCount(tableNodes.size());
        folders.add(tables);
        // Core schema objects
        folders.add(emptyFolder("views", connectionId, catalog, "folder-views"));
        folders.add(emptyFolder("functions", connectionId, catalog, "folder-functions"));
        folders.add(emptyFolder("procedures", connectionId, catalog, "folder-procedures"));
        folders.add(emptyFolder("triggers", connectionId, catalog, "folder-triggers"));
        // Extension folders (models / workspace scripts / AI)
        folders.add(emptyFolder("models", connectionId, catalog, "folder-models"));
        folders.add(emptyFolder("workspaces", connectionId, catalog, "folder-ws"));
        folders.add(emptyFolder("ai", connectionId, catalog, "folder-ai"));
        return folders;
    }

    public TreeNode buildSchemaNode(String connectionId, String catalog, String schema) {
        TreeNode schemaNode = new TreeNode();
        schemaNode.setId(SchemaNodeIds.nodeId("schema", connectionId, catalog, schema));
        schemaNode.setLabel(schema);
        schemaNode.setType("schema");
        schemaNode.setExpanded(false);
        schemaNode.setChildren(new ArrayList<>());
        return schemaNode;
    }

    public List<TreeNode> buildSchemaChildren(String connectionId, String catalog, String schema, List<TreeNode> tableNodes) {
        List<TreeNode> folders = new ArrayList<>();
        TreeNode tables = schemaFolderNode("tables", connectionId, catalog, schema, "folder-tables");
        tables.setChildren(new ArrayList<>(tableNodes));
        tables.setChildCount(tableNodes.size());
        folders.add(tables);
        // Core schema objects
        folders.add(schemaEmptyFolder("views", connectionId, catalog, schema, "folder-views"));
        folders.add(schemaEmptyFolder("functions", connectionId, catalog, schema, "folder-functions"));
        folders.add(schemaEmptyFolder("procedures", connectionId, catalog, schema, "folder-procedures"));
        folders.add(schemaEmptyFolder("triggers", connectionId, catalog, schema, "folder-triggers"));
        // Extension folders (models / workspace scripts / AI) — same level as flat-database trees
        folders.add(schemaEmptyFolder("models", connectionId, catalog, schema, "folder-models"));
        folders.add(schemaEmptyFolder("workspaces", connectionId, catalog, schema, "folder-ws"));
        folders.add(schemaEmptyFolder("ai", connectionId, catalog, schema, "folder-ai"));
        return folders;
    }

    public List<TreeNode> buildTableSkeleton(String connectionId, String catalog, String tableName) {
        return buildTableSkeleton(connectionId, catalog, null, tableName);
    }

    public List<TreeNode> buildTableSkeleton(String connectionId, String catalog, String schema, String tableName) {
        List<TreeNode> children = new ArrayList<>();
        TreeNode columns = new TreeNode();
        columns.setId(tableSectionId("cols", connectionId, catalog, schema, tableName));
        columns.setLabel("columns");
        columns.setType("columns");
        columns.setExpanded(false);
        columns.setChildren(new ArrayList<>());
        children.add(columns);

        TreeNode keys = new TreeNode();
        keys.setId(tableSectionId("keys", connectionId, catalog, schema, tableName));
        keys.setLabel("keys");
        keys.setType("keys");
        keys.setChildren(new ArrayList<>());
        children.add(keys);

        TreeNode indexes = new TreeNode();
        indexes.setId(tableSectionId("idx", connectionId, catalog, schema, tableName));
        indexes.setLabel("indexes");
        indexes.setType("indexes");
        indexes.setChildren(new ArrayList<>());
        children.add(indexes);
        return children;
    }

    public List<TreeNode> buildViewSkeleton(String connectionId, String catalog, String tableName) {
        return buildViewSkeleton(connectionId, catalog, null, tableName);
    }

    public List<TreeNode> buildViewSkeleton(String connectionId, String catalog, String schema, String viewName) {
        List<TreeNode> children = new ArrayList<>();
        TreeNode columns = new TreeNode();
        columns.setId(viewSectionId("cols", connectionId, catalog, schema, viewName));
        columns.setLabel("columns");
        columns.setType("columns");
        columns.setExpanded(false);
        columns.setChildren(new ArrayList<>());
        children.add(columns);
        return children;
    }

    public List<TreeNode> loadColumnNodes(
                                          Connection connection,
                                          String connectionId,
                                          String catalog,
                                          String tableName,
                                          SchemaScope scope) throws SQLException {
        DatabaseMetaData meta = connection.getMetaData();
        Set<String> primaryKeys = TableMetadataLoader.loadPrimaryKeyColumnNames(meta, scope, tableName);

        List<TreeNode> columns = new ArrayList<>();
        try (ResultSet rs = meta.getColumns(scope.catalogPattern(), scope.schemaPattern(), tableName, "%")) {
            while (rs.next()) {
                String columnName = rs.getString("COLUMN_NAME");
                String typeName = rs.getString("TYPE_NAME");
                String remarks = rs.getString("REMARKS");
                boolean isPk = primaryKeys.contains(columnName.toLowerCase(Locale.ROOT));
                TreeNode column = new TreeNode();
                column.setId(SchemaNodeIds.nodeId("col", connectionId, catalog, tableName, columnName));
                column.setLabel(columnName);
                column.setType(isPk ? "primary_key" : "column");
                if (typeName != null && !typeName.isBlank()) {
                    String metaText = typeName.toLowerCase(Locale.ROOT);
                    if (isPk) {
                        metaText = metaText + " · pk";
                    }
                    column.setMeta(metaText);
                } else if (isPk) {
                    column.setMeta("pk");
                }
                if (remarks != null && !remarks.isBlank()) {
                    column.setComment(remarks);
                }
                columns.add(column);
            }
        }
        return columns;
    }

    public List<TreeNode> loadColumnNodesFromDetails(
                                                     String connectionId,
                                                     String catalog,
                                                     String schema,
                                                     String tableName,
                                                     List<TableColumnDetail> details) {
        List<TreeNode> columns = new ArrayList<>();
        for (TableColumnDetail detail : details) {
            String columnName = detail.name();
            TreeNode column = new TreeNode();
            if (schema != null && !schema.isBlank()) {
                column.setId(SchemaNodeIds.nodeId("col", connectionId, catalog, schema, tableName, columnName));
            } else {
                column.setId(SchemaNodeIds.nodeId("col", connectionId, catalog, tableName, columnName));
            }
            column.setLabel(columnName);
            column.setType("PRI".equalsIgnoreCase(detail.keyType()) ? "primary_key" : "column");
            if (detail.dataType() != null && !detail.dataType().isBlank()) {
                String metaText = detail.dataType().toLowerCase(Locale.ROOT);
                if ("PRI".equalsIgnoreCase(detail.keyType())) {
                    metaText = metaText + " · pk";
                }
                column.setMeta(metaText);
            } else if ("PRI".equalsIgnoreCase(detail.keyType())) {
                column.setMeta("pk");
            }
            if (detail.comment() != null && !detail.comment().isBlank()) {
                column.setComment(detail.comment());
            }
            columns.add(column);
        }
        return columns;
    }

    private TreeNode emptyFolder(String label, String connectionId, String catalog, String prefix) {
        TreeNode folder = new TreeNode();
        folder.setId(SchemaNodeIds.nodeId(prefix, connectionId, catalog));
        folder.setLabel(label);
        folder.setType("folder");
        folder.setExpanded(false);
        folder.setChildren(new ArrayList<>());
        folder.setChildCount(0);
        return folder;
    }

    private TreeNode folderNode(String label, String connectionId, String catalog, String prefix) {
        return emptyFolder(label, connectionId, catalog, prefix);
    }

    private TreeNode schemaEmptyFolder(String label, String connectionId, String catalog, String schema, String prefix) {
        TreeNode folder = new TreeNode();
        folder.setId(SchemaNodeIds.nodeId(prefix, connectionId, catalog, schema));
        folder.setLabel(label);
        folder.setType("folder");
        folder.setExpanded(false);
        folder.setChildren(new ArrayList<>());
        folder.setChildCount(0);
        return folder;
    }

    private TreeNode schemaFolderNode(String label, String connectionId, String catalog, String schema, String prefix) {
        return schemaEmptyFolder(label, connectionId, catalog, schema, prefix);
    }

    private static String tableSectionId(
                                         String prefix,
                                         String connectionId,
                                         String catalog,
                                         String schema,
                                         String tableName) {
        if (schema != null && !schema.isBlank()) {
            return SchemaNodeIds.nodeId(prefix, connectionId, catalog, schema, tableName);
        }
        return SchemaNodeIds.nodeId(prefix, connectionId, catalog, tableName);
    }

    private static String viewSectionId(
                                        String prefix,
                                        String connectionId,
                                        String catalog,
                                        String schema,
                                        String viewName) {
        if (schema != null && !schema.isBlank()) {
            return SchemaNodeIds.nodeId(prefix, connectionId, catalog, schema, "view", viewName);
        }
        return SchemaNodeIds.nodeId(prefix, connectionId, catalog, "view", viewName);
    }
}
