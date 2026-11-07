package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.ConnectionConfig;
import org.apache.datawise.backend.domain.ConnectionResult;
import org.apache.datawise.backend.domain.GroupResult;
import org.apache.datawise.backend.domain.ImportConnectionsResult;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.springframework.stereotype.Service;

import java.util.List;

/** Explorer 可变操作门面：分组与连接 CRUD、导入。 */
@Service
public class ExplorerConnectionAdminService {

    private final ConnectionExecutionContext connectionContext;
    private final ExplorerGroupService groupService;
    private final ExplorerNodeAdminService nodeAdminService;
    private final ExplorerReorderService reorderService;
    private final ConnectionVisibilityService connectionVisibilityService;

    public ExplorerConnectionAdminService(
            ConnectionExecutionContext connectionContext,
            ExplorerGroupService groupService,
            ExplorerNodeAdminService nodeAdminService,
            ExplorerReorderService reorderService,
            ConnectionVisibilityService connectionVisibilityService
    ) {
        this.connectionContext = connectionContext;
        this.groupService = groupService;
        this.nodeAdminService = nodeAdminService;
        this.reorderService = reorderService;
        this.connectionVisibilityService = connectionVisibilityService;
    }

    public GroupResult createGroup(String label, String parentId) {
        return groupService.createGroup(label, parentId);
    }

    public List<TreeNode> updateGroup(String groupId, String label) {
        return groupService.updateGroup(groupId, label);
    }

    public ConnectionResult createConnection(ConnectionConfig config, String groupId) {
        return nodeAdminService.createConnection(config, groupId);
    }

    public List<TreeNode> updateConnection(String connectionId, ConnectionConfig config) {
        return nodeAdminService.updateConnection(connectionId, config);
    }

    public List<TreeNode> moveConnection(String connectionId, String targetGroupId) {
        return nodeAdminService.moveConnection(connectionId, targetGroupId);
    }

    public List<TreeNode> reorder(String nodeId, String targetId, String position) {
        return reorderService.reorder(nodeId, targetId, position);
    }

    public boolean isCatalogStructureNode(String nodeId) {
        return connectionVisibilityService.resolveGroupEntity(nodeId).isPresent()
                || connectionVisibilityService.resolveConnectionEntity(nodeId).isPresent();
    }

    public List<TreeNode> deleteNode(String nodeId) {
        connectionContext.requireUserId();
        if (connectionVisibilityService.resolveGroupEntity(nodeId).isPresent()) {
            groupService.deleteGroupCascade(nodeId);
            return groupService.buildGroupTree();
        }
        if (connectionVisibilityService.resolveConnectionEntity(nodeId).isPresent()) {
            return nodeAdminService.deleteConnection(nodeId);
        }
        throw ExplorerNodeResolver.nodeNotFound();
    }

    public ImportConnectionsResult importConnections(List<ConnectionConfig> configs) {
        return nodeAdminService.importConnections(configs);
    }
}
