package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.domain.TreeNode;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Builds leaf Explorer nodes from unique object names. */
public final class ExplorerLeafNodes {

    private ExplorerLeafNodes() {
    }

    public static List<TreeNode> fromNames(
                                           String connectionId,
                                           String catalog,
                                           String schema,
                                           String nodeType,
                                           String idPrefix,
                                           Iterable<String> names) {
        Set<String> seen = new LinkedHashSet<>();
        List<TreeNode> nodes = new ArrayList<>();
        for (String name : names) {
            if (name == null || name.isBlank() || !seen.add(name)) {
                continue;
            }
            String trimmed = name.trim();
            TreeNode node = new TreeNode();
            node.setId(ExplorerObjectNodeIds.objectId(idPrefix, connectionId, catalog, schema, trimmed));
            node.setLabel(trimmed);
            node.setType(nodeType);
            node.setExpanded(false);
            node.setChildren(List.of());
            nodes.add(node);
        }
        return nodes;
    }
}
