package org.apache.datawise.backend.domain;

import java.util.List;

public record GroupResult(String groupId, List<TreeNode> tree) {
}
