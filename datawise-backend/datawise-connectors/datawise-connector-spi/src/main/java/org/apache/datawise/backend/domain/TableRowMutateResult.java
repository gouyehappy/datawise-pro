package org.apache.datawise.backend.domain;

public record TableRowMutateResult(
        int affectedRows,
        String sql) {
}
