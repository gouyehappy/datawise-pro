package org.apache.datawise.backend.database.federated;

/**
 * 从联邦 SQL 中提取 {@code (subquery) @alias} 子查询文本。
 */
public final class FederatedSqlSubquerySupport {

    private FederatedSqlSubquerySupport() {
    }

    public static String extractSubQuery(String viewSql, String alias) {
        if (viewSql == null || alias == null || alias.isBlank()) {
            return null;
        }
        String marker = "@" + alias.trim();
        int idx = viewSql.indexOf(marker);
        if (idx < 0) {
            return null;
        }
        int closeParen = idx > 0 ? viewSql.lastIndexOf(')', idx - 1) : -1;
        if (closeParen < 0) {
            return null;
        }
        int openParen = findMatchingOpenParen(viewSql, closeParen);
        if (openParen < 0 || openParen >= closeParen) {
            return null;
        }
        return viewSql.substring(openParen + 1, closeParen).trim();
    }

    private static int findMatchingOpenParen(String sql, int closeIndex) {
        int depth = 0;
        for (int i = closeIndex; i >= 0; i--) {
            char ch = sql.charAt(i);
            if (ch == ')') {
                depth++;
            } else if (ch == '(') {
                depth--;
                if (depth == 0) {
                    return i;
                }
            }
        }
        return -1;
    }
}
