package org.apache.datawise.sqlparser.visitors;

import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.statement.select.SelectItem;
import org.apache.datawise.sqlparser.VisitorContext;
import org.apache.datawise.sqlparser.support.VisitorRegistry;

public class RecursiveSelectItemVisitor extends CommonSelectItemVisitor {

    private final VisitorRegistry registry;

    public RecursiveSelectItemVisitor(VisitorContext visitorContext, VisitorRegistry registry) {
        super(visitorContext);
        this.registry = registry;
    }

    @Override
    public <S> Void visit(SelectItem<? extends Expression> selectItem, S context) {
        super.visit(selectItem, context);
        Expression expression = selectItem.getExpression();
        if (expression != null) {
            expression.accept(registry.expressionVisitor(), context);
        }
        return null;
    }
}
