package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.domain.SqlReviewRequest;
import org.apache.datawise.backend.domain.SqlReviewResultDto;

/**
 * Optional enricher for SQL review (e.g. AI rewrite). Provided by datawise-ai when present.
 */
public interface SqlReviewEnricher {

    SqlReviewResultDto enrich(SqlReviewRequest request, SqlReviewResultDto base);
}
