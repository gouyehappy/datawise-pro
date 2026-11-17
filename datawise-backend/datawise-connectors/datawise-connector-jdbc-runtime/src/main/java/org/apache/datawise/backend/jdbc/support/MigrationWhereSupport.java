package org.apache.datawise.backend.jdbc.support;

import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import org.apache.datawise.sqlparser.SqlTransformOps;

import java.util.Locale;
import java.util.regex.Pattern;

/** 迁移向导 WHERE 子句安全校验（仅允许只读过滤表达式，禁止子查询与副作用）。 */
public final class MigrationWhereSupport {

    /** Defense-in-depth keyword / comment blacklist; AST whitelist is authoritative. */
    private static final Pattern FORBIDDEN = Pattern.compile(
            "(?i)(;|--|/\\*|\\*/|\\b("
                    + "insert|update|delete|drop|truncate|alter|create|grant|revoke|exec|execute|merge|call|union|"
                    + "select|into|outfile|dumpfile|load_file|benchmark|pg_sleep|sleep|information_schema|"
                    + "pg_catalog|sys\\.|xp_|sp_|declare|waitfor"
                    + ")\\b)"
    );

    private MigrationWhereSupport() {
    }

    public static void validate(String whereClause) {
        if (whereClause == null || whereClause.isBlank()) {
            return;
        }
        String trimmed = whereClause.trim();
        if (trimmed.length() > 2000) {
            throw new IllegalArgumentException("WHERE clause is too long");
        }
        if (FORBIDDEN.matcher(trimmed).find()) {
            throw new IllegalArgumentException("Unsafe WHERE clause");
        }
        try {
            Expression expression = CCJSqlParserUtil.parseCondExpression(trimmed);
            MigrationWhereExpressionValidator.validate(expression);
        } catch (JSQLParserException ex) {
            throw new IllegalArgumentException("Unsafe WHERE clause: parse failed", ex);
        }
    }

    public static String appendWhere(String baseSelectSql, String whereClause) {
        if (whereClause == null || whereClause.isBlank()) {
            return baseSelectSql;
        }
        validate(whereClause);
        // Validated expression only — SqlTransformOps fails closed on parse errors (no string concat).
        return SqlTransformOps.appendWhere(baseSelectSql, whereClause.trim());
    }

    public static boolean scopesEqual(
            String sourceConnectionId,
            String sourceDatabase,
            String targetConnectionId,
            String targetDatabase
    ) {
        return normalize(sourceConnectionId).equals(normalize(targetConnectionId))
                && normalize(sourceDatabase).equals(normalize(targetDatabase));
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
