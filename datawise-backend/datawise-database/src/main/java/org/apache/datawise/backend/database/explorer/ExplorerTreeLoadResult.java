package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.domain.TreePayload;

import java.util.List;

/** Service-layer result for explorer child loads (payload + HTTP caching metadata). */
public record ExplorerTreeLoadResult(TreePayload payload, String etag) {

    public List<TreeNode> tree() {
        return payload != null ? payload.tree() : List.of();
    }
}
