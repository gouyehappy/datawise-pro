package org.apache.datawise.backend.schema.introspect.views;

import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.introspect.ExplorerLeafNodes;

import java.util.List;

public final class JdbcViewListingSupport {

    private JdbcViewListingSupport() {
    }

    public static List<TreeNode> toViewNodes(
                                             String connectionId,
                                             String catalog,
                                             String schema,
                                             Iterable<String> names) {
        return ExplorerLeafNodes.fromNames(connectionId, catalog, schema, "view", "view", names);
    }
}
