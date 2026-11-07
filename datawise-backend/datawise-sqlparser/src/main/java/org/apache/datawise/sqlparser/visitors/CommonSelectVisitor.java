package org.apache.datawise.sqlparser.visitors;

import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.SelectVisitorAdapter;
import net.sf.jsqlparser.statement.select.SetOperationList;
import net.sf.jsqlparser.statement.select.WithItem;
import org.apache.datawise.sqlparser.VisitorContext;

public class CommonSelectVisitor extends SelectVisitorAdapter<Void> {

    protected final VisitorContext visitorContext;

    public CommonSelectVisitor(VisitorContext visitorContext) {
        this.visitorContext = visitorContext;
    }

    @Override
    public <S> Void visit(PlainSelect plainSelect, S context) {
        visitorContext.invokeHandlers(plainSelect);
        return null;
    }

    @Override
    public <S> Void visit(SetOperationList setOpList, S context) {
        visitorContext.invokeHandlers(setOpList);
        return null;
    }

    @Override
    public <S> Void visit(WithItem<?> withItem, S context) {
        visitorContext.invokeHandlers(withItem);
        return null;
    }

    public VisitorContext getVisitorContext() {
        return visitorContext;
    }
}
