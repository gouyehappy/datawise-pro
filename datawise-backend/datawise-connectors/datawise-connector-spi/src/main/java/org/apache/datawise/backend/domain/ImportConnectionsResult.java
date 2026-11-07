package org.apache.datawise.backend.domain;

import java.util.List;

public record ImportConnectionsResult(int count, List<TreeNode> tree) {
}
