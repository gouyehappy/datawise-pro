package org.apache.datawise.sqlparser.handle;

import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.select.PlainSelect;
import org.apache.datawise.sqlparser.VisitorContext;

import java.util.ArrayList;
import java.util.List;

/**
 * AND-injects a lexicographic keyset seek predicate ({@code (c1 > v1) OR (c1 = v1 AND c2 > v2) ...})
 * into the outer query WHERE clause.
 */
public final class KeysetSeekHandler extends MainQueryHandler {

    private final Expression condition;

    public KeysetSeekHandler(List<String> orderByColumns, List<String> lastValues) throws JSQLParserException {
        if (orderByColumns == null || orderByColumns.isEmpty()) {
            throw new IllegalArgumentException("orderByColumns must not be empty");
        }
        if (lastValues == null || lastValues.isEmpty()) {
            throw new IllegalArgumentException("lastValues must not be empty");
        }
        if (orderByColumns.size() != lastValues.size()) {
            throw new IllegalArgumentException("orderByColumns size mismatch with seek key");
        }
        this.condition = CCJSqlParserUtil.parseCondExpression(buildLexicographicGreaterPredicate(orderByColumns, lastValues));
    }

    @Override
    protected void apply(PlainSelect plainSelect, VisitorContext visitorContext) {
        new WhereConditionHandler(condition).handle(plainSelect, visitorContext);
    }

    public static String buildLexicographicGreaterPredicate(List<String> columns, List<String> values) {
        List<String> disjuncts = new ArrayList<>(columns.size());
        for (int i = 0; i < columns.size(); i++) {
            List<String> conjuncts = new ArrayList<>(i + 1);
            for (int j = 0; j < i; j++) {
                conjuncts.add(eqLiteral(columns.get(j).trim(), values.get(j)));
            }
            conjuncts.add(gtLiteral(columns.get(i).trim(), values.get(i)));
            disjuncts.add(conjuncts.size() == 1 ? conjuncts.get(0) : "(" + String.join(" AND ", conjuncts) + ")");
        }
        return "(" + String.join(" OR ", disjuncts) + ")";
    }

    private static boolean isNullSeek(String value) {
        return value == null || NULL_SEEK_SENTINEL.equals(value);
    }

    private static String eqLiteral(String column, String value) {
        if (isNullSeek(value)) {
            return column + " IS NULL";
        }
        return column + " = " + formatSeekLiteral(value);
    }

    /**
     * After a NULL in ASC order (NULLs first on common engines), any non-null is "greater".
     */
    private static String gtLiteral(String column, String value) {
        if (isNullSeek(value)) {
            return column + " IS NOT NULL";
        }
        return column + " > " + formatSeekLiteral(value);
    }

    private static String formatSeekLiteral(String value) {
        if (isNullSeek(value)) {
            return "NULL";
        }
        if (value.matches("-?\\d+")) {
            return value;
        }
        if (value.matches("-?\\d+\\.\\d+")) {
            return value;
        }
        return sqlLiteral(value);
    }

    /** Empty string is a real key value; do not coerce to SQL NULL (that makes {@code > NULL} always false). */
    private static String sqlLiteral(String value) {
        return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'";
    }

    /** Must match {@code MigrationOrderBySupport.NULL_SEEK_SENTINEL}. */
    public static final String NULL_SEEK_SENTINEL = "\u0001DW_NULL\u0001";
}
