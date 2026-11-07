package org.apache.datawise.backend.domain;

import org.apache.datawise.backend.model.FederatedViewSource;

import java.util.List;

public record SaveFederatedViewRequest(
        String id,
        String name,
        String description,
        List<FederatedViewSource> sources,
        String sql) {
}
