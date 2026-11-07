package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.CatalogSchemaScope;
import org.apache.datawise.backend.service.InstanceWorkspaceService;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/** Explorer workspace 文件夹缓存同步。 */
@Service
public class ExplorerWorkspaceSync {

    private final ExplorerTreeBuilder treeBuilder;
    private final InstanceWorkspaceService instanceWorkspaceService;

    public ExplorerWorkspaceSync(
            ExplorerTreeBuilder treeBuilder,
            InstanceWorkspaceService instanceWorkspaceService
    ) {
        this.treeBuilder = treeBuilder;
        this.instanceWorkspaceService = instanceWorkspaceService;
    }

    public void syncWorkspacesInCache(String connectionId, String instanceName) throws IOException {
        List<TreeNode> schemaRoots = treeBuilder.loadSchemaChildren(connectionId);
        if (schemaRoots.isEmpty()) {
            return;
        }

        CatalogSchemaScope scope = CatalogSchemaScope.parse(instanceName);
        TreeNode scopeNode = findScopeNode(schemaRoots, scope);
        if (scopeNode == null) {
            return;
        }

        if (scopeNode.getChildren() == null) {
            scopeNode.setChildren(new ArrayList<>());
        }
        final List<TreeNode> scopeChildren = scopeNode.getChildren();
        String instanceKey = scope.instanceKey();

        TreeNode workspacesFolder = scopeChildren.stream()
                .filter(node -> "folder".equals(node.getType()) && "workspaces".equalsIgnoreCase(node.getLabel()))
                .findFirst()
                .orElseGet(() -> {
                    TreeNode folder = instanceWorkspaceService.buildWorkspacesFolderNode(connectionId, instanceKey);
                    scopeChildren.add(folder);
                    return folder;
                });
        workspacesFolder.setChildren(instanceWorkspaceService.listSqlFileNodes(connectionId, instanceKey));
        treeBuilder.saveSchemaChildren(connectionId, schemaRoots);
    }

    private TreeNode findScopeNode(List<TreeNode> roots, CatalogSchemaScope scope) {
        if (scope.hasSchema()) {
            TreeNode catalogNode = findDatabaseNodeByLabel(roots, scope.catalog());
            if (catalogNode == null || catalogNode.getChildren() == null) {
                return null;
            }
            for (TreeNode child : catalogNode.getChildren()) {
                if ("schema".equals(child.getType())
                        && child.getLabel() != null
                        && child.getLabel().equalsIgnoreCase(scope.schema())) {
                    return child;
                }
            }
            return null;
        }
        return findDatabaseNodeByLabel(roots, scope.catalog());
    }

    private TreeNode findDatabaseNodeByLabel(List<TreeNode> roots, String catalog) {
        for (TreeNode root : roots) {
            if ("database".equals(root.getType())
                    && root.getLabel() != null
                    && root.getLabel().equalsIgnoreCase(catalog)) {
                return root;
            }
            if (root.getChildren() != null) {
                TreeNode found = findDatabaseNodeByLabel(root.getChildren(), catalog);
                if (found != null) {
                    return found;
                }
            }
        }
        return null;
    }
}
