package org.apache.datawise.backend.schema.introspect.routines;

import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.introspect.ExplorerLeafNodes;

import java.util.List;

public final class JdbcRoutineListingSupport {

    private JdbcRoutineListingSupport() {
    }

    public static List<TreeNode> toRoutineNodes(
                                                String connectionId,
                                                String catalog,
                                                String schema,
                                                String nodeType,
                                                String idPrefix,
                                                Iterable<String> names) {
        return ExplorerLeafNodes.fromNames(connectionId, catalog, schema, nodeType, idPrefix, names);
    }
}
