package org.apache.datawise.backend.domain;

import org.apache.datawise.backend.model.FederatedViewSource;

import java.util.List;

public record GenerateFederatedSqlRequest(
        String prompt,
        List<FederatedViewSource> sources) {
}
