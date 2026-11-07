package org.apache.datawise.backend.database.federated;

/**
 * BETWEEN helpers for {@link FederatedJoinResidualFilter}.
 */
final class FederatedJoinBetweenSupport {

    private FederatedJoinBetweenSupport() {
    }

    /**
     * Parse {@code left [NOT] BETWEEN low AND high}. Bounds may be literals, columns, or
     * supported unary string functions. Returns null when the atom is not a BETWEEN form.
     */
    static BetweenPredicate parseBetweenPredicate(String atom) {
        if (atom == null || atom.isBlank()) {
            return null;
        }
        String trimmed = atom.trim();
        int notBetweenIdx = FederatedJoinSqlTokens.findKeyword(trimmed, "not between", 11);
        int betweenIdx = FederatedJoinSqlTokens.findKeyword(trimmed, "between", 7);
        boolean negated;
        int keywordStart;
        int keywordLen;
        if (notBetweenIdx >= 0) {
            negated = true;
            keywordStart = notBetweenIdx;
            keywordLen = 11;
        } else if (betweenIdx >= 0) {
            negated = false;
            keywordStart = betweenIdx;
            keywordLen = 7;
        } else {
            return null;
        }
        String left = trimmed.substring(0, keywordStart).trim();
        String afterBetween = trimmed.substring(keywordStart + keywordLen).trim();
        if (left.isEmpty() || afterBetween.isEmpty()) {
            return null;
        }
        int andIdx = FederatedJoinSqlTokens.findKeyword(afterBetween, "and", 3);
        if (andIdx < 0) {
            return null;
        }
        String low = afterBetween.substring(0, andIdx).trim();
        String high = afterBetween.substring(andIdx + 3).trim();
        if (low.isEmpty() || high.isEmpty()) {
            return null;
        }
        return new BetweenPredicate(left, negated, low, high);
    }

    /**
     * Inclusive BETWEEN. Any NULL operand yields false (three-valued SQL unknown → filter out).
     */
    static boolean betweenMatches(Object value, Object low, Object high, boolean negated) {
        if (value == null || low == null || high == null) {
            return false;
        }
        boolean inRange = FederatedJoinResidualFilter.compareValues(value, low) >= 0
                && FederatedJoinResidualFilter.compareValues(value, high) <= 0;
        return negated != inRange;
    }

    record BetweenPredicate(String left, boolean negated, String low, String high) {
    }
}
