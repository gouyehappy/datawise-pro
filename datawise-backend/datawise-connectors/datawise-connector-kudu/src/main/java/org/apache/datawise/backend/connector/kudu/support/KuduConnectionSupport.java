package org.apache.datawise.backend.connector.kudu.support;

import org.apache.datawise.backend.kudu.KuduClientFactory;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.apache.datawise.backend.schema.introspect.SchemaTreeBuilder;
import org.apache.kudu.client.KuduClient;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public final class KuduConnectionSupport {

    /** Virtual catalog name used by Explorer for flat Kudu table namespaces. */
    public static final String DEFAULT_CATALOG = "default";

    private static final SchemaTreeBuilder TREE_BUILDER = new SchemaTreeBuilder();

    private KuduConnectionSupport() {
    }

    public static void ping(ConnectionEntity entity) {
        KuduClientSupport.withClient(entity, client -> {
            client.getTablesList().getTablesList();
            return null;
        });
    }

    public static List<String> listTables(ConnectionEntity entity) {
        return KuduClientSupport.withClient(entity, client -> {
            List<String> tables = new ArrayList<>(client.getTablesList().getTablesList());
            tables.removeIf(name -> name == null || name.isBlank());
            tables.sort(String.CASE_INSENSITIVE_ORDER);
            return tables;
        });
    }

    public static String resolveCatalog(String database) {
        if (database == null || database.isBlank()) {
            return DEFAULT_CATALOG;
        }
        return database.trim();
    }

    public static List<TreeNode> buildDatabaseNodes(String connectionId, List<String> catalogs) {
        List<TreeNode> nodes = new ArrayList<>();
        for (String catalog : catalogs) {
            nodes.add(TREE_BUILDER.buildDatabaseNode(connectionId, catalog, List.of()));
        }
        return nodes;
    }

    public static List<TreeNode> buildTableNodes(String connectionId, String catalog, List<String> tables) {
        List<TreeNode> tableNodes = new ArrayList<>();
        for (String table : tables) {
            TreeNode node = new TreeNode();
            node.setId(SchemaNodeIds.nodeId("tbl", connectionId, catalog, table));
            node.setLabel(table);
            node.setType("table");
            node.setExpanded(false);
            node.setChildren(new ArrayList<>());
            tableNodes.add(node);
        }
        return tableNodes;
    }

    public static List<TreeNode> buildDatabaseChildren(String connectionId, String catalog, List<String> tables) {
        return TREE_BUILDER.buildDatabaseChildren(
                connectionId,
                catalog,
                buildTableNodes(connectionId, catalog, tables)
        );
    }

    public static List<TreeNode> buildTableSkeletonChildren(String connectionId, String catalog, String tableName) {
        return TREE_BUILDER.buildTableSkeleton(connectionId, catalog, tableName);
    }

    public static String describeTarget(ConnectionEntity entity) {
        if (entity == null) {
            return "";
        }
        return KuduClientFactory.resolveMasters(entity);
    }

    public static List<String> filterTables(List<String> tables, String pattern) {
        if (pattern == null || pattern.isBlank() || "%".equals(pattern)) {
            return tables;
        }
        String normalized = pattern.trim().toLowerCase();
        String like = normalized.replace("%", ".*").replace("_", ".");
        return tables.stream()
                .filter(name -> name != null && name.toLowerCase().matches(like))
                .sorted(Comparator.naturalOrder())
                .toList();
    }
}
