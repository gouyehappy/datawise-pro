package org.apache.datawise.backend.ai.support;

import org.apache.datawise.sqlparser.SqlTransformOps;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * AI 生成 SQL 的安全校验：仅允许只读查询
 */
public final class AiSqlSafetyChecker {

    private static final Pattern FORBIDDEN = Pattern.compile(
            "\\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|MERGE|GRANT|REVOKE|CALL|EXEC|"
                    + "INTO\\s+OUTFILE|INTO\\s+DUMPFILE|FOR\\s+UPDATE|LOCK\\s+IN\\s+SHARE\\s+MODE|"
                    + "LOAD\\s+DATA|COPY\\s+\\S+\\s+FROM|xp_cmdshell)\\b",
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

        String upper = stripped.toUpperCase(Locale.ROOT);
        if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
            throw new IllegalArgumentException("Only SELECT queries are allowed for data analysis");
        }
        if (FORBIDDEN.matcher(stripped).find()) {
            throw new IllegalArgumentException("Only read-only SELECT queries are allowed for data analysis");
        }
        return normalized;
    }
}
