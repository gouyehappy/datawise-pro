package org.apache.datawise.backend.database.federated;

import java.util.ArrayList;
import java.util.List;

/**
 * IS NULL / IN / bare NOT helpers for {@link FederatedJoinResidualFilter}.
 */
final class FederatedJoinNullInSupport {

    private FederatedJoinNullInSupport() {
    }

    /**
     * Parse {@code left IS [NOT] NULL}. Returns null when the atom is not a null-check form.
     */
    static NullCheck parseNullCheck(String atom) {
        if (atom == null || atom.isBlank()) {
            return null;
        }
        String trimmed = atom.trim();
        int notNullIdx = FederatedJoinSqlTokens.findKeyword(trimmed, "is not null", 11);
        if (notNullIdx >= 0) {
            String left = trimmed.substring(0, notNullIdx).trim();
            String rest = trimmed.substring(notNullIdx + 11).trim();
            if (!left.isEmpty() && rest.isEmpty()) {
                return new NullCheck(left, true);
            }
            return null;
        }
        int nullIdx = FederatedJoinSqlTokens.findKeyword(trimmed, "is null", 7);
        if (nullIdx >= 0) {
            String left = trimmed.substring(0, nullIdx).trim();
            String rest = trimmed.substring(nullIdx + 7).trim();
            if (!left.isEmpty() && rest.isEmpty()) {
                return new NullCheck(left, false);
            }
        }
        return null;
    }

    /**
     * Strip a leading bare {@code NOT} (not {@code NOT IN}). Returns the remainder, or null
     * when the atom is not a bare-NOT form.
     */
    static String stripLeadingNot(String atom) {
        if (atom == null || atom.isBlank()) {
            return null;
        }
        String trimmed = atom.trim();
        // Keep "NOT IN (...)" / "NOT BETWEEN" for dedicated parsers.
        if (FederatedJoinSqlTokens.findKeyword(trimmed, "not in", 6) == 0
                || FederatedJoinSqlTokens.findKeyword(trimmed, "not between", 11) == 0) {
            return null;
        }
        if (FederatedJoinSqlTokens.findKeyword(trimmed, "not", 3) != 0) {
            return null;
        }
        String rest = trimmed.substring(3).trim();
        return rest.isEmpty() ? null : rest;
    }

    /**
     * Parse {@code left [NOT] IN (lit, …)}. Returns null when the atom is not an IN form;
     * throws when it looks like IN but the list is not all literals.
     */
    static InPredicate parseInPredicate(String atom) {
        if (atom == null || atom.isBlank()) {
            return null;
        }
        String trimmed = atom.trim();
        int notInIdx = FederatedJoinSqlTokens.findKeyword(trimmed, "not in", 6);
        int inIdx = FederatedJoinSqlTokens.findKeyword(trimmed, "in", 2);
        boolean negated;
        int keywordStart;
        int keywordLen;
        if (notInIdx >= 0) {
            negated = true;
            keywordStart = notInIdx;
            keywordLen = 6;
        } else if (inIdx >= 0) {
            negated = false;
            keywordStart = inIdx;
            keywordLen = 2;
        } else {
            return null;
        }
        String left = trimmed.substring(0, keywordStart).trim();
        String rest = trimmed.substring(keywordStart + keywordLen).trim();
        if (left.isEmpty()
                || !rest.startsWith("(")
                || !rest.endsWith(")")
                || !FederatedJoinSqlTokens.parensFullyWrap(rest)) {
            return null;
        }
        String listBody = rest.substring(1, rest.length() - 1).trim();
        List<Object> values = parseLiteralList(listBody);
        if (values == null) {
            throw new IllegalArgumentException(
                    "Unsupported federated residual IN list (literals only): " + atom
            );
        }
        return new InPredicate(left, negated, values);
    }

    /** Comma-split literal list; null if any token is not a literal. */
    static List<Object> parseLiteralList(String listBody) {
        if (listBody == null || listBody.isBlank()) {
            return List.of();
        }
        List<Object> values = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inSingle = false;
        boolean inDouble = false;
        for (int i = 0; i < listBody.length(); i++) {
            char ch = listBody.charAt(i);
            if (ch == '\'' && !inDouble) {
                inSingle = !inSingle;
                current.append(ch);
            } else if (ch == '"' && !inSingle) {
                inDouble = !inDouble;
                current.append(ch);
            } else if (ch == ',' && !inSingle && !inDouble) {
                if (!addLiteralToken(values, current)) {
                    return null;
                }
                current = new StringBuilder();
            } else {
                current.append(ch);
            }
        }
        if (!addLiteralToken(values, current)) {
            return null;
        }
        return values;
    }

    private static boolean addLiteralToken(List<Object> values, StringBuilder current) {
        String token = current.toString().trim();
        if (token.isEmpty()) {
            return true;
        }
        if (!FederatedJoinResidualFilter.isLiteral(token)) {
            return false;
        }
        values.add(FederatedJoinResidualFilter.literalValue(token));
        return true;
    }

    record NullCheck(String column, boolean negated) {
    }

    record InPredicate(String left, boolean negated, List<Object> values) {
    }
}
