package org.apache.datawise.backend.ai.sql;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlReviewAiRewriteServiceTest {

    @Test
    void mockRewriteAddsWhereForDeleteWithoutPredicate() {
        String rewritten = SqlReviewAiRewriteService.mockRewrite(
                "DELETE FROM users",
                List.of(new org.apache.datawise.backend.domain.SqlReviewFindingDto(
                        "error", "MISSING_WHERE", "no where", "add where"
                )),
                null
        );
        assertTrue(rewritten.toUpperCase().contains("WHERE"));
    }
}
