package org.apache.datawise.sqlparser.visitors;

import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.operators.relational.ExpressionList;
import net.sf.jsqlparser.expression.operators.relational.NamedExpressionList;
import net.sf.jsqlparser.statement.select.ParenthesedSelect;
import org.apache.datawise.sqlparser.VisitorContext;

/**
 * Handler dispatch for expression-list style nodes (replaces ItemsListVisitor from older JSQLParser).
 */
public class CommonItemsListVisitor {

    protected final VisitorContext visitorContext;

    public CommonItemsListVisitor(VisitorContext visitorContext) {
        this.visitorContext = visitorContext;
    }

    public void visit(ParenthesedSelect parenthesedSelect) {
        visitorContext.invokeHandlers(parenthesedSelect);
    }

    public void visit(ExpressionList<? extends Expression> expressionList) {
        visitorContext.invokeHandlers(expressionList);
    }

    public void visit(NamedExpressionList<?> namedExpressionList) {
        visitorContext.invokeHandlers(namedExpressionList);
    }

    public VisitorContext getVisitorContext() {
        return visitorContext;
    }
}
