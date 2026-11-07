package org.apache.datawise.backend.database.federated;

/**
 * LIKE / string-literal helpers for {@link FederatedJoinResidualFilter}.
 */
final class FederatedJoinLikeSupport {

    private FederatedJoinLikeSupport() {
    }

    /**
     * Parse {@code left [NOT] LIKE 'pattern' [ESCAPE 'x']}. Pattern (and escape) must be
     * string literals. Returns null when the atom is not a LIKE form.
     */
    static LikePredicate parseLikePredicate(String atom) {
        if (atom == null || atom.isBlank()) {
            return null;
        }
        String trimmed = atom.trim();
        int notLikeIdx = FederatedJoinSqlTokens.findKeyword(trimmed, "not like", 8);
        int likeIdx = FederatedJoinSqlTokens.findKeyword(trimmed, "like", 4);
        boolean negated;
        int keywordStart;
        int keywordLen;
        if (notLikeIdx >= 0) {
            negated = true;
            keywordStart = notLikeIdx;
            keywordLen = 8;
        } else if (likeIdx >= 0) {
            negated = false;
            keywordStart = likeIdx;
            keywordLen = 4;
        } else {
            return null;
        }
        String left = trimmed.substring(0, keywordStart).trim();
        String afterLike = trimmed.substring(keywordStart + keywordLen).trim();
        if (left.isEmpty() || afterLike.isEmpty()) {
            return null;
        }
        StringLiteralTake patternLit = takeLeadingStringLiteral(afterLike);
        if (patternLit == null) {
            return null;
        }
        String rest = patternLit.remainder().trim();
        Character escape = null;
        if (!rest.isEmpty()) {
            if (FederatedJoinSqlTokens.findKeyword(rest, "escape", 6) != 0) {
                return null;
            }
            String afterEscape = rest.substring(6).trim();
            StringLiteralTake escapeLit = takeLeadingStringLiteral(afterEscape);
            if (escapeLit == null || !escapeLit.remainder().trim().isEmpty()) {
                return null;
            }
            if (escapeLit.value().length() != 1) {
                throw new IllegalArgumentException(
                        "Federated residual LIKE ESCAPE must be a single character: " + atom
                );
            }
            escape = escapeLit.value().charAt(0);
        }
        return new LikePredicate(left, negated, patternLit.value(), escape);
    }

    static boolean likeMatches(Object value, String pattern) {
        return likeMatches(value, pattern, null);
    }

    static boolean likeMatches(Object value, String pattern, Character escape) {
        if (value == null || pattern == null) {
            return false;
        }
        return toLikeRegex(pattern, escape).matcher(String.valueOf(value)).matches();
    }

    /** Convert SQL LIKE pattern ({@code %} / {@code _}, optional ESCAPE) to a full-match regex. */
    static java.util.regex.Pattern toLikeRegex(String pattern) {
        return toLikeRegex(pattern, null);
    }

    static java.util.regex.Pattern toLikeRegex(String pattern, Character escape) {
        StringBuilder regex = new StringBuilder("^");
        for (int i = 0; i < pattern.length(); i++) {
            char ch = pattern.charAt(i);
            if (escape != null && ch == escape) {
                if (i + 1 >= pattern.length()) {
                    appendRegexLiteral(regex, ch);
                    continue;
                }
                appendRegexLiteral(regex, pattern.charAt(++i));
                continue;
            }
            if (ch == '%') {
                regex.append(".*");
            } else if (ch == '_') {
                regex.append('.');
            } else {
                appendRegexLiteral(regex, ch);
            }
        }
        regex.append('$');
        return java.util.regex.Pattern.compile(regex.toString(), java.util.regex.Pattern.DOTALL);
    }

    private static void appendRegexLiteral(StringBuilder regex, char ch) {
        if ("\\.[]{}()*+-?^$|".indexOf(ch) >= 0) {
            regex.append('\\');
        }
        regex.append(ch);
    }

    /** Consume a leading SQL string literal; return value + remainder, or null. */
    static StringLiteralTake takeLeadingStringLiteral(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String trimmed = text.trim();
        char quote = trimmed.charAt(0);
        if (quote != '\'' && quote != '"') {
            return null;
        }
        StringBuilder body = new StringBuilder();
        for (int i = 1; i < trimmed.length(); i++) {
            char ch = trimmed.charAt(i);
            if (ch == quote) {
                if (i + 1 < trimmed.length() && trimmed.charAt(i + 1) == quote) {
                    body.append(quote);
                    i++;
                    continue;
                }
                return new StringLiteralTake(body.toString(), trimmed.substring(i + 1));
            }
            body.append(ch);
        }
        return null;
    }

    record LikePredicate(String left, boolean negated, String pattern, Character escape) {
    }

    record StringLiteralTake(String value, String remainder) {
    }
}
