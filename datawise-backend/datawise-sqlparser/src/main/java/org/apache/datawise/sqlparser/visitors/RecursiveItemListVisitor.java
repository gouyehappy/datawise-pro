package org.apache.datawise.sqlparser.visitors;

import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.operators.relational.ExpressionList;
import net.sf.jsqlparser.statement.select.ParenthesedSelect;
import org.apache.datawise.sqlparser.VisitorContext;
import org.apache.datawise.sqlparser.support.CollUtil;
import org.apache.datawise.sqlparser.support.SelectTraversalSupport;
import org.apache.datawise.sqlparser.support.VisitorRegistry;

public class RecursiveItemListVisitor extends CommonItemsListVisitor {

    private final VisitorRegistry registry;

    public RecursiveItemListVisitor(VisitorContext visitorContext, VisitorRegistry registry) {
        super(visitorContext);
        this.registry = registry;
    }

    public void visit(ParenthesedSelect parenthesedSelect) {
        super.visit(parenthesedSelect);
        SelectTraversalSupport.walkParenthesedSelect(parenthesedSelect, registry, null);
    }

    public void visit(ExpressionList<? extends Expression> expressionList) {
        super.visit(expressionList);
        if (CollUtil.isNotEmpty(expressionList)) {
            expressionList.forEach(expression -> expression.accept(registry.expressionVisitor(), null));
        }
    }
}
