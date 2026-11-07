package org.apache.datawise.backend.domain;

import java.util.List;

public record ConnectionResult(String connectionId, List<TreeNode> tree) {
}
