package org.apache.datawise.sqlparser.visitors;

import net.sf.jsqlparser.statement.select.LateralSubSelect;
import net.sf.jsqlparser.statement.select.ParenthesedFromItem;
import net.sf.jsqlparser.statement.select.ParenthesedSelect;
import org.apache.datawise.sqlparser.VisitorContext;
import org.apache.datawise.sqlparser.support.SelectTraversalSupport;
import org.apache.datawise.sqlparser.support.VisitorRegistry;

public class RecursiveFromItemVisitor extends CommonFromItemVisitor {

    private final VisitorRegistry registry;

    public RecursiveFromItemVisitor(VisitorContext visitorContext, VisitorRegistry registry) {
        super(visitorContext);
        this.registry = registry;
    }

    @Override
    public <S> Void visit(ParenthesedSelect parenthesedSelect, S context) {
        super.visit(parenthesedSelect, context);
        SelectTraversalSupport.walkParenthesedSelect(parenthesedSelect, registry, context);
        return null;
    }

    @Override
    public <S> Void visit(ParenthesedFromItem parenthesedFromItem, S context) {
        super.visit(parenthesedFromItem, context);
        if (parenthesedFromItem.getFromItem() != null) {
            parenthesedFromItem.getFromItem().accept(this, context);
        }
        SelectTraversalSupport.walkJoins(
                parenthesedFromItem.getJoins(),
                this,
                registry.expressionVisitor(),
                context
        );
        return null;
    }

    @Override
    public <S> Void visit(LateralSubSelect lateralSubSelect, S context) {
        super.visit(lateralSubSelect, context);
        if (lateralSubSelect.getSelect() != null) {
            lateralSubSelect.getSelect().accept(registry.selectVisitor(), context);
        }
        return null;
    }
}
