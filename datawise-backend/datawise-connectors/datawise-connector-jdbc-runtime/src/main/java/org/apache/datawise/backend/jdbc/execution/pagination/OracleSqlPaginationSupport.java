package org.apache.datawise.backend.jdbc.execution.pagination;

import org.apache.datawise.backend.jdbc.execution.SqlPaginationClauseSupport;

import java.util.regex.Pattern;

/**
 * Oracle 分页实现：
 * <ul>
 *   <li>纯表扫描补 {@code ORDER BY ROWID}，避免 CLOB 列触发 ORA-00932，且首屏/续页顺序一致</li>
 *   <li>{@code COUNT}/{@code GROUP BY}/{@code DISTINCT}/{@code UNION} 等不补 ROWID（否则 ORA-00904/ORA-01445）</li>
 *   <li>首屏（offset=0）用 {@code ROWNUM} 子查询，兼容 11g</li>
 *   <li>续页用 12c+ {@code OFFSET/FETCH}</li>
 * </ul>
 */
public final class OracleSqlPaginationSupport {

    /** 不依赖列类型，恒可排序（仅适用于可投影 ROWID 的基表查询）。 */
    public static final String STABLE_ORDER_CLAUSE = " ORDER BY ROWID";

    private static final Pattern GROUP_BY = Pattern.compile("\\bgroup\\s+by\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern SELECT_DISTINCT =
            Pattern.compile("\\bselect\\s+distinct\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern UNION = Pattern.compile("\\bunion\\b", Pattern.CASE_INSENSITIVE);
    /** Top-level select list starts with a common aggregate — ROWID is not available on the result. */
    private static final Pattern AGGREGATE_SELECT = Pattern.compile(
            "\\bselect\\s+(?:all\\s+)?(?:count|sum|avg|min|max)\\s*\\(",
            Pattern.CASE_INSENSITIVE
    );

    private OracleSqlPaginationSupport() {
    }

    public static String applyLimitOffset(String sql, int limit, int offset) {
        SqlPaginationClauseSupport.validateLimitOffset(limit, offset);
        String body = SqlPaginationClauseSupport.normalizeBody(sql);
        String orderClause = canAppendStableRowIdOrder(body) ? STABLE_ORDER_CLAUSE : null;
        String ordered = SqlPaginationOrderSupport.ensureOrderBy(body, orderClause);
        if (offset <= 0) {
            return "SELECT * FROM (SELECT * FROM (" + ordered + ") WHERE ROWNUM <= " + limit + ")";
        }
        return SqlPaginationClauseSupport.appendClause(
                ordered,
                " OFFSET " + offset + " ROWS FETCH NEXT " + limit + " ROWS ONLY"
        );
    }

    /**
     * Only append {@code ORDER BY ROWID} when the statement looks like a simple projection
     * from a row-addressable source. Existing {@code ORDER BY} is left untouched by
     * {@link SqlPaginationOrderSupport#ensureOrderBy}.
     */
    static boolean canAppendStableRowIdOrder(String sql) {
        if (SqlPaginationOrderSupport.hasOrderBy(sql)) {
            return false;
        }
        String probe = stripLiteralsAndComments(sql);
        if (GROUP_BY.matcher(probe).find()) {
            return false;
        }
        if (SELECT_DISTINCT.matcher(probe).find()) {
            return false;
        }
        if (UNION.matcher(probe).find()) {
            return false;
        }
        return !AGGREGATE_SELECT.matcher(probe).find();
    }

    /** Best-effort strip so keywords inside literals/comments do not block ROWID. */
    static String stripLiteralsAndComments(String sql) {
        String s = sql.replaceAll("'(?:[^']|'')*'", "''");
        s = s.replaceAll("--[^\\r\\n]*", " ");
        s = s.replaceAll("/\\*[\\s\\S]*?\\*/", " ");
        return s;
    }
}
