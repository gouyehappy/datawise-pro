package org.apache.datawise.backend.platform.sql;

import org.apache.datawise.backend.database.sql.SqlReviewEnricher;
import org.apache.datawise.backend.database.sql.SqlReviewService;
import org.apache.datawise.backend.domain.SqlReviewRequest;
import org.apache.datawise.backend.domain.SqlReviewResultDto;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

@Service
public class SqlReviewOrchestrator {

    private final SqlReviewService sqlReviewService;
    private final ObjectProvider<SqlReviewEnricher> enrichers;

    public SqlReviewOrchestrator(
            SqlReviewService sqlReviewService,
            ObjectProvider<SqlReviewEnricher> enrichers
    ) {
        this.sqlReviewService = sqlReviewService;
        this.enrichers = enrichers;
    }

    public SqlReviewResultDto review(SqlReviewRequest request) {
        SqlReviewResultDto base = sqlReviewService.review(request);
        if (!Boolean.TRUE.equals(request.aiRewrite())) {
            return base;
        }
        SqlReviewResultDto current = base;
        for (SqlReviewEnricher enricher : enrichers.orderedStream().toList()) {
            current = enricher.enrich(request, current);
        }
        return current;
    }
}
