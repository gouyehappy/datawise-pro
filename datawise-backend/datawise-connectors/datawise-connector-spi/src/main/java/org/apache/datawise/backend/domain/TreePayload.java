package org.apache.datawise.backend.domain;

import java.util.List;

public record TreePayload(List<TreeNode> tree, Boolean hasMore, Integer nextOffset, String etag) {

    public TreePayload(List<TreeNode> tree) {
        this(tree, null, null, null);
    }
}
