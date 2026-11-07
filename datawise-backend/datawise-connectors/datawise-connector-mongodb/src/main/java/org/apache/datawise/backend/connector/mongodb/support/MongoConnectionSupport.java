package org.apache.datawise.backend.connector.mongodb.support;

import com.mongodb.client.MongoIterable;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.apache.datawise.backend.schema.introspect.SchemaTreeBuilder;
import org.bson.Document;

import java.util.ArrayList;
import java.util.List;

public final class MongoConnectionSupport {

    private static final SchemaTreeBuilder TREE_BUILDER = new SchemaTreeBuilder();

    private MongoConnectionSupport() {
    }

    public static void ping(ConnectionEntity entity) {
        MongoClientSupport.withClient(entity, client -> {
            Document result = client.getDatabase("admin").runCommand(new Document("ping", 1));
            if (result == null || !result.containsKey("ok")) {
                throw new IllegalStateException("MongoDB ping failed");
            }
            return null;
        });
    }

    public static List<String> listDatabases(ConnectionEntity entity) {
        return MongoClientSupport.withClient(entity, client -> {
            List<String> names = new ArrayList<>();
            for (String name : client.listDatabaseNames()) {
                if (name != null && !name.isBlank()) {
                    names.add(name);
                }
            }
            names.sort(String.CASE_INSENSITIVE_ORDER);
            return names;
        });
    }

    public static List<String> listCollections(ConnectionEntity entity, String database) {
        MongoClientSupport.requireDatabase(database);
        return MongoClientSupport.withClient(entity, client -> {
            List<String> names = new ArrayList<>();
            MongoIterable<String> collections = client.getDatabase(database).listCollectionNames();
            for (String name : collections) {
                if (name != null && !name.isBlank()) {
                    names.add(name);
                }
            }
            names.sort(String.CASE_INSENSITIVE_ORDER);
            return names;
        });
    }

    public static List<TreeNode> buildDatabaseNodes(String connectionId, List<String> databases) {
        List<TreeNode> nodes = new ArrayList<>();
        for (String database : databases) {
            nodes.add(TREE_BUILDER.buildDatabaseNode(connectionId, database, List.of()));
        }
        return nodes;
    }

    public static List<TreeNode> buildCollectionNodes(String connectionId, String database, List<String> collections) {
        List<TreeNode> tableNodes = new ArrayList<>();
        for (String collection : collections) {
            TreeNode table = new TreeNode();
            table.setId(SchemaNodeIds.nodeId("tbl", connectionId, database, collection));
            table.setLabel(collection);
            table.setType("table");
            table.setMeta("collection");
            table.setExpanded(false);
            table.setChildren(new ArrayList<>());
            tableNodes.add(table);
        }
        return tableNodes;
    }

    public static List<TreeNode> buildDatabaseChildren(String connectionId, String database, List<String> collections) {
        return TREE_BUILDER.buildDatabaseChildren(
                connectionId,
                database,
                buildCollectionNodes(connectionId, database, collections)
        );
    }

    public static List<TreeNode> buildTableSkeletonChildren(String connectionId, String catalog, String tableName) {
        return TREE_BUILDER.buildTableSkeleton(connectionId, catalog, tableName);
    }

    public static String describeTarget(ConnectionEntity entity) {
        if (entity == null) {
            return "";
        }
        String host = entity.getHost();
        String port = entity.getPort();
        if (host == null || host.isBlank()) {
            return "";
        }
        if (port == null || port.isBlank()) {
            return host;
        }
        return host + ":" + port;
    }
}
