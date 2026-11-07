package org.apache.datawise.sqlparser.support;

import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.select.Limit;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import net.sf.jsqlparser.statement.select.SetOperationList;

import java.util.regex.Pattern;

/**
 * Pagination clause assembly: decides whether LIMIT/OFFSET can be appended directly or needs
 * a subquery wrapper. Dialect-specific clause text is still supplied by connector dialects.
 */
public final class SqlPaginationSupport {

    private static final Pattern LIMIT_PATTERN = Pattern.compile("\\blimit\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern OFFSET_PATTERN = Pattern.compile("\\boffset\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern FOR_UPDATE_PATTERN = Pattern.compile("\\bfor\\s+update\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern SET_OPERATION_PATTERN = Pattern.compile(
            "\\b(union|intersect|except)\\b",
            Pattern.CASE_INSENSITIVE
    );

    private SqlPaginationSupport() {
    }

    public static void validateLimitOffset(int limit, int offset) {
        if (limit <= 0) {
            throw new IllegalArgumentException("limit must be positive");
        }
        if (offset < 0) {
            throw new IllegalArgumentException("offset must be non-negative");
        }
    }

    public static String normalizeBody(String sql) {
        String body = SqlTextSupport.stripTrailingSemicolon(sql);
        if (body.isBlank()) {
            throw new IllegalArgumentException("SQL is required");
        }
        return body;
    }

    public static String appendClause(String sql, String clause) {
        String body = normalizeBody(sql);
        if (canAppendLimitDirectly(body)) {
            return body + clause;
        }
        return "SELECT * FROM (" + body + ") AS _dw_page" + clause;
    }

    public static boolean canAppendLimitDirectly(String sql) {
        if (sql == null || sql.isBlank()) {
            return false;
        }
        try {
            Statement statement = CCJSqlParserUtil.parse(sql);
            return canAppendLimitDirectly(statement);
        } catch (JSQLParserException ignored) {
            return canAppendLimitDirectlyByRegex(sql);
        }
    }

    public static boolean canAppendLimitDirectly(Statement statement) {
        if (!(statement instanceof Select select)) {
            return false;
        }
        if (select instanceof SetOperationList) {
            return false;
        }
        PlainSelect plainSelect = select.getPlainSelect();
        if (plainSelect == null) {
            return canAppendLimitDirectlyByRegex(select.toString());
        }
        if (plainSelect.getLimit() != null) {
            return false;
        }
        if (plainSelect.getOffset() != null) {
            return false;
        }
        Limit limitBy = plainSelect.getLimitBy();
        if (limitBy != null) {
            return false;
        }
        if (plainSelect.getForUpdateTable() != null) {
            return false;
        }
        return canAppendLimitDirectlyByRegex(select.toString());
    }

    private static boolean canAppendLimitDirectlyByRegex(String sql) {
        if (LIMIT_PATTERN.matcher(sql).find()) {
            return false;
        }
        if (OFFSET_PATTERN.matcher(sql).find()) {
            return false;
        }
        if (FOR_UPDATE_PATTERN.matcher(sql).find()) {
            return false;
        }
        return !SET_OPERATION_PATTERN.matcher(sql).find();
    }
}
