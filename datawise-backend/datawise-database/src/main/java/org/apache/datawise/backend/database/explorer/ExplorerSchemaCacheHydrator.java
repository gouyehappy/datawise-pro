package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Materializes missing ancestor nodes in the persisted schema cache before resolving nested lazy loads.
 */
@Component
public class ExplorerSchemaCacheHydrator {

    @FunctionalInterface
    public interface NodeChildrenLoader {
        List<TreeNode> load(TreeNode target) throws Exception;
    }

    private final ExplorerTreeBuilder treeBuilder;

    public ExplorerSchemaCacheHydrator(ExplorerTreeBuilder treeBuilder) {
        this.treeBuilder = treeBuilder;
    }

    public void ensureAncestorsLoaded(
            String connectionId,
            String nodeId,
            List<TreeNode> schemaRoots,
            NodeChildrenLoader loader
    ) {
        try {
            ensureAncestorsLoadedInternal(connectionId, nodeId, schemaRoots, loader);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to hydrate schema cache for node " + nodeId, ex);
        }
    }

    private void ensureAncestorsLoadedInternal(
            String connectionId,
            String nodeId,
            List<TreeNode> schemaRoots,
            NodeChildrenLoader loader
    ) throws Exception {
        SchemaNodeIdScope scope = SchemaNodeIdScope.resolve(connectionId, nodeId, schemaRoots).orElse(null);
        if (scope == null) {
            return;
        }

        if (scope.needsCatalogSchemaList()) {
            TreeNode catalogNode = findCatalogNode(schemaRoots, scope.catalog());
            if (catalogNode != null && hasUnresolvedChildren(catalogNode)) {
                loader.load(catalogNode);
            }
        }

        if (scope.needsSchemaBranch() && scope.schema() != null) {
            TreeNode schemaNode = findSchemaNode(schemaRoots, scope.catalog(), scope.schema());
            if (schemaNode != null && hasUnresolvedChildren(schemaNode)) {
                loader.load(schemaNode);
            }
        }
    }

    private TreeNode findCatalogNode(List<TreeNode> schemaRoots, String catalogLabel) {
        for (TreeNode root : schemaRoots) {
            if ("database".equals(root.getType())
                    && catalogLabel.equals(root.getLabel())) {
                return root;
            }
        }
        return null;
    }

    private TreeNode findSchemaNode(List<TreeNode> schemaRoots, String catalogLabel, String schemaLabel) {
        TreeNode catalogNode = findCatalogNode(schemaRoots, catalogLabel);
        if (catalogNode == null || catalogNode.getChildren() == null) {
            return null;
        }
        for (TreeNode child : catalogNode.getChildren()) {
            if ("schema".equals(child.getType()) && schemaLabel.equals(child.getLabel())) {
                return child;
            }
        }
        String schemaSlug = SchemaNodeIds.slug(schemaLabel);
        for (TreeNode child : catalogNode.getChildren()) {
            if ("schema".equals(child.getType())
                    && schemaSlug.equals(SchemaNodeIds.slug(child.getLabel()))) {
                return child;
            }
        }
        return null;
    }

    private static boolean hasUnresolvedChildren(TreeNode node) {
        List<TreeNode> children = node.getChildren();
        return children == null || children.isEmpty();
    }
}
