package org.apache.datawise.backend.domain;

public record ExecuteFederatedViewRequest(
        String viewId,
        Integer maxRows,
        Integer offset) {
}
