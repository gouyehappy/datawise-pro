package org.apache.datawise.backend.database.federated;

/**
 * Keyword / identifier / parenthesis scanning for federated residual WHERE parsing.
 * Depth- and quote-aware so operators inside literals or parentheses are ignored.
 */
final class FederatedJoinSqlTokens {

    private FederatedJoinSqlTokens() {
    }

    static int findKeyword(String text, String keyword, int keywordLength) {
        int depth = 0;
        boolean inSingle = false;
        boolean inDouble = false;
        for (int i = 0; i <= text.length() - keywordLength; i++) {
            char ch = text.charAt(i);
            if (ch == '\'' && !inDouble) {
                inSingle = !inSingle;
            } else if (ch == '"' && !inSingle) {
                inDouble = !inDouble;
            } else if (!inSingle && !inDouble) {
                if (ch == '(') {
                    depth++;
                } else if (ch == ')') {
                    depth = Math.max(0, depth - 1);
                } else if (depth == 0 && text.regionMatches(true, i, keyword, 0, keywordLength)) {
                    boolean leftOk = i == 0 || !isIdentChar(text.charAt(i - 1));
                    boolean rightOk = i + keywordLength >= text.length()
                            || !isIdentChar(text.charAt(i + keywordLength));
                    if (leftOk && rightOk) {
                        return i;
                    }
                }
            }
        }
        return -1;
    }

    static boolean isIdentChar(char ch) {
        return Character.isLetterOrDigit(ch) || ch == '_';
    }

    /** Unwrap one or more layers of fully wrapping parentheses. */
    static String unwrapOuterParens(String expression) {
        if (expression == null) {
            return null;
        }
        String trimmed = expression.trim();
        while (trimmed.length() >= 2 && trimmed.charAt(0) == '(' && trimmed.charAt(trimmed.length() - 1) == ')') {
            if (!parensFullyWrap(trimmed)) {
                break;
            }
            trimmed = trimmed.substring(1, trimmed.length() - 1).trim();
        }
        return trimmed;
    }

    static boolean parensFullyWrap(String text) {
        int depth = 0;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '(') {
                depth++;
            } else if (ch == ')') {
                depth--;
                if (depth == 0 && i < text.length() - 1) {
                    return false;
                }
                if (depth < 0) {
                    return false;
                }
            }
        }
        return depth == 0;
    }
}
