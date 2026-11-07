package org.apache.datawise.backend.connector.api.support;

import org.apache.datawise.sqlparser.SqlTransformOps;
import org.apache.datawise.sqlparser.support.SqlTextSupport;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.DescribeStatement;
import net.sf.jsqlparser.statement.ExplainStatement;
import net.sf.jsqlparser.statement.ShowStatement;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.UseStatement;
import net.sf.jsqlparser.statement.select.Select;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * 判断 SQL 是否需要写权限（DML/DDL/事务控制等）。
 */
public final class SqlWriteClassifier {

    private static final Pattern DDL = Pattern.compile(
            "\\b(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|RENAME|COMMENT\\s+ON)\\b",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern FORBIDDEN = Pattern.compile(
            "\\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|MERGE|UPSERT|GRANT|REVOKE|"
                    + "CALL|EXEC|EXECUTE|DO|LOAD\\s+DATA|COPY|VACUUM|REFRESH|REINDEX|CLUSTER|"
                    + "HANDLER|LOCK\\s+TABLES|UNLOCK\\s+TABLES|RENAME|COMMENT\\s+ON)\\b",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern SESSION_MUTATING = Pattern.compile(
            "\\b(BEGIN|COMMIT|ROLLBACK|START\\s+TRANSACTION|SET\\s+TRANSACTION)\\b",
            Pattern.CASE_INSENSITIVE);

    /** SELECT-shaped statements with side effects — treat as write for MCP / readonly gates. */
    private static final Pattern SELECT_SIDE_EFFECT = Pattern.compile(
            "(?i)\\bINTO\\s+(OUTFILE|DUMPFILE)\\b|\\bFOR\\s+UPDATE\\b|\\bLOCK\\s+IN\\s+SHARE\\s+MODE\\b|"
                    + "\\bLOAD_FILE\\s*\\(|\\bCOPY\\s+[\\s\\S]+?\\s+TO\\b|\\bCOPY\\s+[\\s\\S]+?\\s+FROM\\b");

    /** MySQL versioned / conditional comments execute as SQL — expand before stripping. */
    private static final Pattern MYSQL_EXECUTABLE_COMMENT = Pattern.compile(
            "/\\*!\\d*([\\s\\S]*?)\\*/");

    private SqlWriteClassifier() {
    }

    public static boolean requiresDdlAccess(String sql) {
        if (sql == null || sql.isBlank()) {
            return false;
        }
        for (String statement : statementsForClassification(sql)) {
            if (requiresDdlAccessSingle(statement)) {
                return true;
            }
        }
        return false;
    }

    public static boolean requiresWriteAccess(String sql) {
        if (sql == null || sql.isBlank()) {
            return false;
        }
        for (String statement : statementsForClassification(sql)) {
            if (requiresWriteAccessSingle(statement)) {
                return true;
            }
        }
        return false;
    }

    /**
     * B-03: DROP / TRUNCATE / DELETE / UPDATE need execution confirmation in UI.
     * Does not include INSERT or DDL such as CREATE / ALTER.
     */
    public static boolean requiresDangerousSqlConfirmation(String sql) {
        if (sql == null || sql.isBlank()) {
            return false;
        }
        for (String statement : statementsForClassification(sql)) {
            if (requiresDangerousSqlConfirmationSingle(statement)) {
                return true;
            }
        }
        return false;
    }

    private static boolean requiresDdlAccessSingle(String sql) {
        String stripped = prepareForClassification(sql);
        return !stripped.isEmpty() && DDL.matcher(stripped).find();
    }

    private static boolean requiresWriteAccessSingle(String sql) {
        String stripped = prepareForClassification(sql);
        if (stripped.isEmpty()) {
            return false;
        }
        Boolean ast = classifyWriteViaAst(stripped);
        if (ast != null) {
            return ast;
        }
        if (SESSION_MUTATING.matcher(stripped).find()) {
            return true;
        }
        if (FORBIDDEN.matcher(stripped).find()) {
            return true;
        }
        if (SELECT_SIDE_EFFECT.matcher(stripped).find()) {
            return true;
        }
        String upper = stripped.toUpperCase(Locale.ROOT);
        return !upper.startsWith("SELECT")
                && !upper.startsWith("WITH")
                && !upper.startsWith("SHOW")
                && !upper.startsWith("DESCRIBE")
                && !upper.startsWith("DESC")
                && !upper.startsWith("EXPLAIN")
                && !upper.startsWith("USE ");
    }

    /**
     * Prefer JSqlParser statement-type classification when the statement parses.
     * Returns {@code null} to fall back to lexical gates (dialect-specific / unparseable SQL).
     */
    static Boolean classifyWriteViaAst(String strippedSql) {
        try {
            Statement statement = CCJSqlParserUtil.parse(strippedSql);
            if (statement instanceof Select select) {
                return selectHasWriteSideEffects(select) ? Boolean.TRUE : Boolean.FALSE;
            }
            if (statement instanceof ExplainStatement
                    || statement instanceof ShowStatement
                    || statement instanceof DescribeStatement
                    || statement instanceof UseStatement) {
                return Boolean.FALSE;
            }
            // Any other parsed statement (DML/DDL/txn/admin) needs write access.
            return Boolean.TRUE;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean selectHasWriteSideEffects(Select select) {
        String rendered = select.toString();
        return SELECT_SIDE_EFFECT.matcher(rendered).find();
    }

    private static boolean requiresDangerousSqlConfirmationSingle(String sql) {
        String stripped = prepareForClassification(sql);
        if (stripped.isEmpty()) {
            return false;
        }
        String upper = stripped.toUpperCase(Locale.ROOT);
        if (upper.startsWith("INSERT ") || upper.startsWith("REPLACE ")) {
            return false;
        }
        String verbTarget = skipLeadingWithClauses(upper);
        return verbTarget.startsWith("DELETE ")
                || verbTarget.startsWith("UPDATE ")
                || verbTarget.startsWith("TRUNCATE ")
                || verbTarget.startsWith("DROP ");
    }

    /**
     * Skip leading {@code WITH cte AS (...)} clauses so {@code WITH x AS (SELECT 1) DELETE FROM t}
     * is classified as dangerous (not ignored because the prefix is WITH).
     */
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
                s = ("WITH " + s.substring(1).trim());
                continue;
            }
            break;
        }
        return s;
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

    private static java.util.List<String> statementsForClassification(String sql) {
        java.util.List<String> statements = SqlTextSupport.splitStatements(expandMysqlExecutableComments(sql));
        if (statements.isEmpty()) {
            return java.util.List.of(sql);
        }
        return statements;
    }

    /**
     * Expand MySQL versioned/conditional comments so stripComments cannot erase
     * executable write payloads, then strip ordinary comments.
     */
    private static String prepareForClassification(String sql) {
        return stripSqlComments(expandMysqlExecutableComments(sql)).trim();
    }

    static String expandMysqlExecutableComments(String sql) {
        if (sql == null || !sql.contains("/*!")) {
            return sql == null ? "" : sql;
        }
        return MYSQL_EXECUTABLE_COMMENT.matcher(sql).replaceAll(" $1 ");
    }

    private static String stripSqlComments(String sql) {
        return SqlTransformOps.stripComments(sql);
    }
}
