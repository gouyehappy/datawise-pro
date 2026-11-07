package org.apache.datawise.backend.database.federated;

/**
 * CASE expression parsing for {@link FederatedJoinResidualFilter}.
 * Evaluation stays on the filter because WHEN predicates reuse conjunct matching.
 */
final class FederatedJoinCaseSupport {

    private FederatedJoinCaseSupport() {
    }

    /**
     * Parse {@code CASE WHEN &lt;predicate&gt; THEN &lt;expr&gt; ELSE &lt;expr&gt; END}.
     * Nested CASE is not supported. Returns null when the token is not this form.
     */
    static CaseExpr parseCase(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        String trimmed = FederatedJoinSqlTokens.unwrapOuterParens(token.trim());
        if (trimmed.length() < 12 || !trimmed.regionMatches(true, 0, "case", 0, 4)) {
            return null;
        }
        int whenIdx = FederatedJoinSqlTokens.findKeyword(trimmed, "when", 4);
        int thenIdx = FederatedJoinSqlTokens.findKeyword(trimmed, "then", 4);
        int elseIdx = FederatedJoinSqlTokens.findKeyword(trimmed, "else", 4);
        int endIdx = FederatedJoinSqlTokens.findKeyword(trimmed, "end", 3);
        if (whenIdx < 0 || thenIdx < 0 || elseIdx < 0 || endIdx < 0) {
            return null;
        }
        if (!(whenIdx < thenIdx && thenIdx < elseIdx && elseIdx < endIdx)) {
            return null;
        }
        // Require trailing END (allow only whitespace after).
        String afterEnd = trimmed.substring(endIdx + 3).trim();
        if (!afterEnd.isEmpty()) {
            return null;
        }
        String predicate = trimmed.substring(whenIdx + 4, thenIdx).trim();
        String thenExpr = trimmed.substring(thenIdx + 4, elseIdx).trim();
        String elseExpr = trimmed.substring(elseIdx + 4, endIdx).trim();
        if (predicate.isEmpty() || thenExpr.isEmpty() || elseExpr.isEmpty()) {
            return null;
        }
        return new CaseExpr(predicate, thenExpr, elseExpr);
    }

    record CaseExpr(String predicate, String thenExpr, String elseExpr) {
    }
}
