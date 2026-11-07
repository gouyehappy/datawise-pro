package org.apache.datawise.sqlparser.visitors;

import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.statement.select.SelectItem;
import net.sf.jsqlparser.statement.select.SelectItemVisitorAdapter;
import org.apache.datawise.sqlparser.VisitorContext;

public class CommonSelectItemVisitor extends SelectItemVisitorAdapter<Void> {

    protected final VisitorContext visitorContext;

    public CommonSelectItemVisitor(VisitorContext visitorContext) {
        this.visitorContext = visitorContext;
    }

    @Override
    public <S> Void visit(SelectItem<? extends Expression> selectItem, S context) {
        visitorContext.invokeHandlers(selectItem);
        return null;
    }

    public VisitorContext getVisitorContext() {
        return visitorContext;
    }
}
