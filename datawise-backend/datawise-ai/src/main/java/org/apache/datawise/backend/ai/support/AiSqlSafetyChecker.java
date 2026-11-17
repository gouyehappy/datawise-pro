package org.apache.datawise.backend.ai.support;

import org.apache.datawise.sqlparser.SqlTransformOps;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * AI 生成 SQL 的安全校验：仅允许只读查询
 */
public final class AiSqlSafetyChecker {

    /**
     * Write / side-effect patterns on SQL with string literals already stripped.
     * Omits bare {@code REPLACE}/{@code CALL}/{@code EXEC} so function names and
     * identifier columns are not treated as DML (e.g. {@code SELECT REPLACE(col,...)}).
     */
    private static final Pattern FORBIDDEN = Pattern.compile(
            "\\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|MERGE|GRANT|REVOKE)\\b"
                    + "|\\bREPLACE\\s+INTO\\b"
                    // Procedure calls only — bare CALL/EXEC identifiers (column aliases) are allowed.
                    + "|\\b(CALL|EXEC|EXECUTE)\\s*\\("
                    + "|\\bINTO\\s+OUTFILE\\b|\\bINTO\\s+DUMPFILE\\b"
                    + "|\\bFOR\\s+UPDATE\\b|\\bLOCK\\s+IN\\s+SHARE\\s+MODE\\b"
                    + "|\\bLOAD\\s+DATA\\b|\\bCOPY\\s+\\S+\\s+FROM\\b|\\bxp_cmdshell\\b",
            Pattern.CASE_INSENSITIVE
    );

    private AiSqlSafetyChecker() {
    }

    public static String normalizeGeneratedSql(String sql) {
        return AiSqlNormalizer.normalize(sql);
    }

    public static String requireReadOnlySelect(String sql) {
        if (sql == null || sql.isBlank()) {
            throw new IllegalArgumentException("Generated SQL is empty");
        }

        String normalized = normalizeGeneratedSql(sql);
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("Generated SQL is empty after normalization");
        }

        String stripped = SqlTransformOps.stripComments(normalized).trim();
        if (stripped.isEmpty()) {
            throw new IllegalArgumentException("Generated SQL is empty after removing comments");
        }

        if (!isReadOnlySelectShape(stripped)) {
            throw new IllegalArgumentException("Only SELECT queries are allowed for data analysis");
        }
        String forKeywordScan = stripStringLiterals(stripped);
        if (FORBIDDEN.matcher(forKeywordScan).find()) {
            throw new IllegalArgumentException("Only read-only SELECT queries are allowed for data analysis");
        }
        return normalized;
    }

    /**
     * True when the statement is SELECT-shaped (including WITH … SELECT).
     * Rejects WITH … DML/DDL that only shares a WITH prefix.
     */
    static boolean isReadOnlySelectShape(String strippedSql) {
        String upper = strippedSql.toUpperCase(Locale.ROOT).trim();
        if (upper.startsWith("SELECT")) {
            return true;
        }
        if (!upper.startsWith("WITH")) {
            return false;
        }
        String afterCtes = skipLeadingWithClauses(upper);
        return afterCtes.startsWith("SELECT");
    }

    /** Skip leading {@code WITH cte AS (...)} so trailing DML is visible. */
    static String skipLeadingWithClauses(String upperSql) {
        String s = upperSql.trim();
        while (s.startsWith("WITH ") || s.startsWith("WITH\n") || s.startsWith("WITH\t") || s.startsWith("WITH\r")) {
            int asIdx = indexOfKeyword(s, "AS", 4);
            if (asIdx < 0) {
                break;
            }
            int open = s.indexOf('(', asIdx);
            if (open < 0) {
                break;
            }
            int close = matchingParen(s, open);
            if (close < 0) {
                break;
            }
            s = s.substring(close + 1).trim();
            if (s.startsWith(",")) {
                s = "WITH " + s.substring(1).trim();
                continue;
            }
            break;
        }
        return s;
    }

    /**
     * Replace single- and double-quoted string literals with empty quotes so
     * keyword scans ignore values like {@code 'delete'} / {@code "update"}.
     */
    static String stripStringLiterals(String sql) {
        if (sql == null || sql.isEmpty()) {
            return "";
        }
        StringBuilder out = new StringBuilder(sql.length());
        int i = 0;
        while (i < sql.length()) {
            char c = sql.charAt(i);
            if (c == '\'') {
                out.append("''");
                i++;
                while (i < sql.length()) {
                    char q = sql.charAt(i++);
                    if (q == '\'') {
                        if (i < sql.length() && sql.charAt(i) == '\'') {
                            i++;
                            continue;
                        }
                        break;
                    }
                }
                continue;
            }
            if (c == '"') {
                out.append("\"\"");
                i++;
                while (i < sql.length()) {
                    char q = sql.charAt(i++);
                    if (q == '\\' && i < sql.length()) {
                        i++;
                        continue;
                    }
                    if (q == '"') {
                        break;
                    }
                }
                continue;
            }
            out.append(c);
            i++;
        }
        return out.toString();
    }

    private static int indexOfKeyword(String upper, String keyword, int from) {
        int idx = from;
        while (idx < upper.length()) {
            idx = upper.indexOf(keyword, idx);
            if (idx < 0) {
                return -1;
            }
            boolean leftOk = idx == 0 || !Character.isLetterOrDigit(upper.charAt(idx - 1));
            int end = idx + keyword.length();
            boolean rightOk = end >= upper.length() || !Character.isLetterOrDigit(upper.charAt(end));
            if (leftOk && rightOk) {
                return idx;
            }
            idx = end;
        }
        return -1;
    }

    private static int matchingParen(String s, int openIdx) {
        int depth = 0;
        for (int i = openIdx; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '(') {
                depth++;
            } else if (c == ')') {
                depth--;
                if (depth == 0) {
                    return i;
                }
            }
        }
        return -1;
    }
}
