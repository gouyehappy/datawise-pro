package org.apache.datawise.backend.service.semantic;

import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.springframework.stereotype.Service;

import java.util.List;

/** Explorer「AI」文件夹下的平台能力入口节点（树中不展开明细，双击打开 Tab）。 */
@Service
public class AiPlatformExplorerService {

    static final List<String> FEATURE_KEYS = List.of(
            "semantic_metrics",
            "analysis_canvas",
            "federated_views",
            "schema_drift",
            "data_quality",
            "scheduled_tasks");

    public List<TreeNode> listFeatureNodes(String connectionId, String instanceName) {
        if (connectionId == null || connectionId.isBlank() || instanceName == null || instanceName.isBlank()) {
            return List.of();
        }
        return FEATURE_KEYS.stream()
                .map(feature -> toFeatureNode(connectionId, instanceName, feature))
                .toList();
    }

    private TreeNode toFeatureNode(String connectionId, String instanceName, String featureKey) {
        TreeNode node = new TreeNode();
        node.setId(SchemaNodeIds.platformFeatureNodeId(connectionId, instanceName, featureKey));
        node.setLabel(featureKey);
        node.setType("platform_feature");
        node.setMeta(featureKey);
        node.setExpanded(false);
        node.setChildren(List.of());
        return node;
    }
}
