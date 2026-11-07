package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.common.support.ConnectionEnvironmentSupport;
import org.apache.datawise.backend.configstore.SchemaCacheStore;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Component
public class ExplorerTreeBuilder {

    private final SchemaCacheStore schemaCacheStore;
    private final ConnectionVisibilityService connectionVisibilityService;

    /** Per-request tree index (singleton bean — must not store request state in fields). */
    private final ThreadLocal<CachedTreeIndex> localIndex = new ThreadLocal<>();

    public ExplorerTreeBuilder(
            SchemaCacheStore schemaCacheStore,
            ConnectionVisibilityService connectionVisibilityService
    ) {
        this.schemaCacheStore = schemaCacheStore;
        this.connectionVisibilityService = connectionVisibilityService;
    }

    public List<TreeNode> buildGroups(List<ConnectionGroupEntity> groups) {
        Map<String, List<ConnectionGroupEntity>> childrenByParent = new HashMap<>();
        for (ConnectionGroupEntity group : groups) {
            String parentKey = group.getParentId() != null ? group.getParentId() : "";
            childrenByParent.computeIfAbsent(parentKey, key -> new ArrayList<>()).add(group);
        }
        for (List<ConnectionGroupEntity> siblings : childrenByParent.values()) {
            siblings.sort(Comparator.comparingInt(ConnectionGroupEntity::getSortOrder)
                    .thenComparing(group -> group.getId() == null ? "" : group.getId()));
        }
        List<TreeNode> roots = new ArrayList<>();
        for (ConnectionGroupEntity group : childrenByParent.getOrDefault("", List.of())) {
            roots.add(buildGroupNode(group, childrenByParent));
        }
        return roots;
    }

    private TreeNode buildGroupNode(
            ConnectionGroupEntity group,
            Map<String, List<ConnectionGroupEntity>> childrenByParent
    ) {
        TreeNode node = new TreeNode();
        node.setId(group.getId());
        node.setLabel(group.getLabel());
        node.setType("group");
        // UI expand state is restored from client app-config; catalog flag is unused.
        node.setExpanded(false);
        List<TreeNode> children = new ArrayList<>();
        for (ConnectionGroupEntity child : childrenByParent.getOrDefault(group.getId(), List.of())) {
            children.add(buildGroupNode(child, childrenByParent));
        }
        children.addAll(buildConnections(group.getId()));
        node.setChildren(children);
        return node;
    }

    public List<TreeNode> buildConnections(String groupId) {
        List<TreeNode> result = new ArrayList<>();
        List<ConnectionEntity> connections = connectionVisibilityService.connectionsForGroup(groupId).stream()
                .sorted(Comparator.comparingInt(ConnectionEntity::getSortOrder)
                        .thenComparing(connection -> connection.getId() == null ? "" : connection.getId()))
                .toList();
        for (ConnectionEntity connection : connections) {
            ConnectionEnvironmentSupport.applyToEntity(connection);
            TreeNode node = new TreeNode();
            node.setId(connection.getId());
            node.setLabel(connection.getName());
            node.setType("connection");
            node.setDbType(connection.getDbType());
            String pluginId = connection.getPluginId();
            if (pluginId != null && !pluginId.isBlank()) {
                node.setPluginId(pluginId.trim());
            }
            node.setEnv(connection.getEnv());
            node.setEnvCustom(connection.getEnvCustom());
            String databaseName = connection.getDatabaseName();
            if (databaseName != null && !databaseName.isBlank()) {
                node.setDatabase(databaseName.trim());
            }
            node.setExpanded(false);
            node.setChildren(List.of());
            result.add(node);
        }
        return result;
    }

    public List<TreeNode> loadSchemaChildren(String connectionId) {
        return schemaCacheStore.load(connectionId);
    }

    public List<TreeNode> loadSchemaChildren(String connectionId, long ttlMs) {
        return schemaCacheStore.load(connectionId, ttlMs);
    }

    public long schemaCacheVersion(String connectionId) {
        return schemaCacheStore.version(connectionId);
    }

    public void saveSchemaChildren(String connectionId, List<TreeNode> children) {
        schemaCacheStore.save(connectionId, children);
    }

    public TreeNode findNodeById(List<TreeNode> roots, String nodeId) {
        return indexOf(roots).find(nodeId);
    }

    public TreeNode findParentById(List<TreeNode> roots, String nodeId) {
        return indexOf(roots).parent(nodeId);
    }

    public void replaceNodeChildren(List<TreeNode> roots, String nodeId, List<TreeNode> children) {
        TreeNode node = findNodeById(roots, nodeId);
        if (node != null) {
            node.setChildren(children != null ? children : new ArrayList<>());
            invalidateIndex();
        }
    }

    /** Appends children without duplicates (used for paginated table folders). */
    public void appendUniqueChildren(List<TreeNode> roots, String nodeId, List<TreeNode> children) {
        if (children == null || children.isEmpty()) {
            return;
        }
        TreeNode node = findNodeById(roots, nodeId);
        if (node == null) {
            return;
        }
        List<TreeNode> merged = node.getChildren() != null
                ? new ArrayList<>(node.getChildren())
                : new ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (TreeNode existing : merged) {
            if (existing != null && existing.getId() != null) {
                seen.add(existing.getId());
            }
        }
        for (TreeNode child : children) {
            if (child == null || child.getId() == null || seen.contains(child.getId())) {
                continue;
            }
            merged.add(child);
            seen.add(child.getId());
        }
        node.setChildren(merged);
        invalidateIndex();
    }

    /**
     * Ensures a paginated table node exists in the persisted schema cache so lazy column loads resolve.
     */
    public TreeNode registerTableNodeIfAbsent(String connectionId, String tableNodeId, List<TreeNode> schemaRoots) {
        if (connectionId == null || tableNodeId == null || tableNodeId.isBlank()) {
            return null;
        }
        TreeNode existing = findNodeById(schemaRoots, tableNodeId);
        if (existing != null) {
            return existing;
        }
        Optional<SchemaNodeIdScope> scope = SchemaNodeIdScope.resolve(connectionId, tableNodeId, schemaRoots);
        if (scope.isEmpty() || !tableNodeId.startsWith("table-" + connectionId + "-")) {
            return null;
        }
        String tableLabel = tableLabelFromNodeId(connectionId, tableNodeId, scope.get(), schemaRoots);
        if (tableLabel == null || tableLabel.isBlank()) {
            return null;
        }
        TreeNode tablesFolder = findTablesFolder(schemaRoots, scope.get());
        if (tablesFolder == null) {
            return null;
        }
        TreeNode table = new TreeNode();
        table.setId(tableNodeId);
        table.setLabel(tableLabel);
        table.setType("table");
        table.setExpanded(false);
        table.setChildren(List.of());
        appendUniqueChildren(schemaRoots, tablesFolder.getId(), List.of(table));
        return findNodeById(schemaRoots, tableNodeId);
    }

    private static TreeNode findTablesFolder(List<TreeNode> schemaRoots, SchemaNodeIdScope scope) {
        TreeNode catalogNode = null;
        for (TreeNode root : schemaRoots) {
            if ("database".equals(root.getType()) && scope.catalog().equals(root.getLabel())) {
                catalogNode = root;
                break;
            }
        }
        if (catalogNode == null) {
            return null;
        }
        TreeNode scopeNode = catalogNode;
        if (scope.schema() != null && !scope.schema().isBlank() && catalogNode.getChildren() != null) {
            for (TreeNode child : catalogNode.getChildren()) {
                if ("schema".equals(child.getType()) && scope.schema().equals(child.getLabel())) {
                    scopeNode = child;
                    break;
                }
            }
        }
        if (scopeNode.getChildren() == null) {
            return null;
        }
        for (TreeNode child : scopeNode.getChildren()) {
            if ("folder".equals(child.getType()) && "tables".equalsIgnoreCase(child.getLabel())) {
                return child;
            }
        }
        return null;
    }

    static String tableLabelFromNodeId(
            String connectionId,
            String tableNodeId,
            SchemaNodeIdScope scope,
            List<TreeNode> schemaRoots
    ) {
        String prefix = "table-" + connectionId + "-";
        if (!tableNodeId.startsWith(prefix)) {
            return null;
        }
        String tail = tableNodeId.substring(prefix.length());
        String catalogSlug = SchemaNodeIds.slug(scope.catalog());
        if (!tail.startsWith(catalogSlug)) {
            return null;
        }
        tail = tail.substring(catalogSlug.length());
        if (tail.startsWith("-")) {
            tail = tail.substring(1);
        }
        if (tail.isBlank()) {
            return null;
        }
        TreeNode catalogNode = null;
        for (TreeNode root : schemaRoots) {
            if ("database".equals(root.getType()) && scope.catalog().equals(root.getLabel())) {
                catalogNode = root;
                break;
            }
        }
        if (catalogNode != null && scope.schema() != null && !scope.schema().isBlank()) {
            boolean hasSchemaBranch = catalogNode.getChildren() != null
                    && catalogNode.getChildren().stream()
                    .anyMatch(child -> "schema".equals(child.getType()) && scope.schema().equals(child.getLabel()));
            if (hasSchemaBranch) {
                String schemaSlug = SchemaNodeIds.slug(scope.schema());
                if (tail.startsWith(schemaSlug + "-")) {
                    tail = tail.substring(schemaSlug.length() + 1);
                } else if (tail.equals(schemaSlug)) {
                    return null;
                }
            }
        }
        return tail.isBlank() ? null : tail;
    }

    public String findDatabaseCatalog(List<TreeNode> roots, String nodeId) {
        TreeNode current = findNodeById(roots, nodeId);
        while (current != null) {
            if ("database".equals(current.getType())) {
                return current.getLabel();
            }
            TreeNode parent = findParentById(roots, current.getId());
            current = parent;
        }
        return null;
    }

    public String findSchemaLabel(List<TreeNode> roots, String nodeId) {
        TreeNode current = findNodeById(roots, nodeId);
        while (current != null) {
            if ("schema".equals(current.getType())) {
                return current.getLabel();
            }
            current = findParentById(roots, current.getId());
        }
        return null;
    }

    public CatalogSchemaContext findCatalogSchemaContext(List<TreeNode> roots, String nodeId) {
        return findCatalogSchemaContext(roots, nodeId, null);
    }

    public CatalogSchemaContext findCatalogSchemaContext(List<TreeNode> roots, String nodeId, String dbType) {
        String catalog = findDatabaseCatalog(roots, nodeId);
        if (catalog == null) {
            return null;
        }
        String schema = findSchemaLabel(roots, nodeId);
        if (schema == null && org.apache.datawise.backend.common.DbType.isSchemaRootFamily(dbType)) {
            schema = catalog;
        }
        return new CatalogSchemaContext(catalog, schema);
    }

    public record CatalogSchemaContext(String catalog, String schema) {
    }

    /** Clears the thread-local tree index (call at end of explorer load requests). */
    public void clearTreeIndex() {
        localIndex.remove();
    }

    private ExplorerTreeIndex indexOf(List<TreeNode> roots) {
        CachedTreeIndex cached = localIndex.get();
        if (cached != null && cached.roots() == roots) {
            return cached.index();
        }
        ExplorerTreeIndex index = ExplorerTreeIndex.build(roots);
        localIndex.set(new CachedTreeIndex(roots, index));
        return index;
    }

    private void invalidateIndex() {
        localIndex.remove();
    }

    private record CachedTreeIndex(List<TreeNode> roots, ExplorerTreeIndex index) {
    }
}
