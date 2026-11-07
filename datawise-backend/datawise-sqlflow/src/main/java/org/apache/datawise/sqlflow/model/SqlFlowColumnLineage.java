package org.apache.datawise.sqlflow.model;

import java.util.List;

public record SqlFlowColumnLineage(
        String outputColumn,
        List<SqlFlowSourceRef> sources,
        String expressionSummary
) {
    public SqlFlowColumnLineage {
        outputColumn = outputColumn == null ? null : outputColumn.trim();
        sources = sources == null ? List.of() : List.copyOf(sources);
        expressionSummary = expressionSummary == null || expressionSummary.isBlank() ? null : expressionSummary.trim();
    }
}
