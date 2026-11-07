package org.apache.datawise.sqlparser.visitors;

import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.ExpressionVisitorAdapter;
import net.sf.jsqlparser.statement.select.ParenthesedSelect;
import org.apache.datawise.sqlparser.VisitorContext;

/** Dispatches registered handlers for expression AST nodes. */
public class CommonExpressionVisitor extends ExpressionVisitorAdapter<Void> {

    protected final VisitorContext visitorContext;

    public CommonExpressionVisitor(VisitorContext visitorContext) {
        this.visitorContext = visitorContext;
    }

    public VisitorContext getVisitorContext() {
        return visitorContext;
    }

    @Override
    protected <S> Void visitExpression(Expression expression, S context) {
        visitorContext.invokeHandlers(expression);
        return null;
    }

    @Override
    public <S> Void visit(ParenthesedSelect parenthesedSelect, S context) {
        visitorContext.invokeHandlers(parenthesedSelect);
        return super.visit(parenthesedSelect, context);
    }
}
