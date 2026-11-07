package org.apache.datawise.backend.domain;

import java.util.List;

public record SqlReviewResultDto(
        boolean allowed,
        boolean requiresApproval,
        List<SqlReviewFindingDto> findings,
        String suggestedSql,
        String rewriteNote) {

    public SqlReviewResultDto(boolean allowed, boolean requiresApproval, List<SqlReviewFindingDto> findings) {
        this(allowed, requiresApproval, findings, null, null);
    }
}
