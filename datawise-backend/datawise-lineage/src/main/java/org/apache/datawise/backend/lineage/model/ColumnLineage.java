package org.apache.datawise.backend.lineage.model;

import java.util.List;

public record ColumnLineage(
        String outputColumn,
        List<SourceRef> sources,
        ExpressionNode expressionTree
) {
}
