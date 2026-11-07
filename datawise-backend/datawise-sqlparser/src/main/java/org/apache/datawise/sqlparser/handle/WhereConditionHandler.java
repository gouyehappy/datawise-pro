package org.apache.datawise.sqlparser.handle;

import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.operators.conditional.AndExpression;
import net.sf.jsqlparser.expression.operators.relational.ParenthesedExpressionList;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.select.PlainSelect;
import org.apache.datawise.sqlparser.VisitorContext;

/**
 * AND-injects an additional predicate into the main query's WHERE clause. Replaces the
 * string-concatenation WHERE assembly used for incremental migration / filtering.
 * The condition is parsed once at construction so invalid SQL fails fast.
 */
public final class WhereConditionHandler extends MainQueryHandler {

    private final Expression condition;

    public WhereConditionHandler(String condition) throws JSQLParserException {
        if (condition == null || condition.isBlank()) {
            throw new IllegalArgumentException("condition must not be blank");
        }
        this.condition = CCJSqlParserUtil.parseCondExpression(condition);
    }

    public WhereConditionHandler(Expression condition) {
        if (condition == null) {
            throw new IllegalArgumentException("condition must not be null");
        }
        this.condition = condition;
    }

    @Override
    protected void apply(PlainSelect plainSelect, VisitorContext visitorContext) {
        Expression existing = plainSelect.getWhere();
        if (existing == null) {
            plainSelect.setWhere(condition);
            return;
        }
        plainSelect.setWhere(new AndExpression(parenthesize(existing), parenthesize(condition)));
    }

    private static Expression parenthesize(Expression expression) {
        return new ParenthesedExpressionList<>(expression);
    }
}
