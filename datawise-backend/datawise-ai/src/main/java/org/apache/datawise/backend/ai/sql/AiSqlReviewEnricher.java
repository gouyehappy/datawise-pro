package org.apache.datawise.backend.ai.sql;

import org.apache.datawise.backend.database.sql.SqlReviewEnricher;
import org.apache.datawise.backend.domain.SqlReviewRequest;
import org.apache.datawise.backend.domain.SqlReviewResultDto;
import org.springframework.stereotype.Component;

@Component
public class AiSqlReviewEnricher implements SqlReviewEnricher {

    private final SqlReviewAiRewriteService rewriteService;

    public AiSqlReviewEnricher(SqlReviewAiRewriteService rewriteService) {
        this.rewriteService = rewriteService;
    }

    @Override
    public SqlReviewResultDto enrich(SqlReviewRequest request, SqlReviewResultDto base) {
        return rewriteService.enrich(request, base);
    }
}
