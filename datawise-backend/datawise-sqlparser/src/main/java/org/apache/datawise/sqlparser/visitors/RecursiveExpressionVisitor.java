package org.apache.datawise.sqlparser.visitors;

import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.AnyComparisonExpression;
import org.apache.datawise.sqlparser.VisitorContext;
import org.apache.datawise.sqlparser.support.VisitorRegistry;

/**
 * Recursively walks expressions using JSQLParser's {@link net.sf.jsqlparser.expression.ExpressionVisitorAdapter}
 * defaults, while dispatching handlers via {@link CommonExpressionVisitor}.
 */
public class RecursiveExpressionVisitor extends CommonExpressionVisitor {

    private final VisitorRegistry registry;

    public RecursiveExpressionVisitor(VisitorContext visitorContext, VisitorRegistry registry) {
        super(visitorContext);
        this.registry = registry;
        setSelectVisitor(registry.selectVisitor());
    }

    @Override
    public <S> Void visit(AnyComparisonExpression anyComparisonExpression, S context) {
        visitorContext.invokeHandlers(anyComparisonExpression);
        if (anyComparisonExpression.getSelect() != null) {
            anyComparisonExpression.getSelect().accept(registry.selectVisitor(), context);
        }
        return null;
    }
}
