package org.apache.datawise.sqlparser.visitors;

import net.sf.jsqlparser.schema.Table;
import net.sf.jsqlparser.statement.select.FromItemVisitorAdapter;
import net.sf.jsqlparser.statement.select.LateralSubSelect;
import net.sf.jsqlparser.statement.select.ParenthesedFromItem;
import net.sf.jsqlparser.statement.select.ParenthesedSelect;
import net.sf.jsqlparser.statement.select.TableFunction;
import net.sf.jsqlparser.statement.select.Values;
import org.apache.datawise.sqlparser.VisitorContext;

public class CommonFromItemVisitor extends FromItemVisitorAdapter<Void> {

    protected final VisitorContext visitorContext;

    public CommonFromItemVisitor(VisitorContext visitorContext) {
        this.visitorContext = visitorContext;
    }

    @Override
    public <S> Void visit(Table tableName, S context) {
        visitorContext.invokeHandlers(tableName);
        return null;
    }

    @Override
    public <S> Void visit(ParenthesedSelect parenthesedSelect, S context) {
        visitorContext.invokeHandlers(parenthesedSelect);
        return null;
    }

    @Override
    public <S> Void visit(LateralSubSelect lateralSubSelect, S context) {
        visitorContext.invokeHandlers(lateralSubSelect);
        return null;
    }

    @Override
    public <S> Void visit(Values values, S context) {
        visitorContext.invokeHandlers(values);
        return null;
    }

    @Override
    public <S> Void visit(TableFunction tableFunction, S context) {
        visitorContext.invokeHandlers(tableFunction);
        return null;
    }

    @Override
    public <S> Void visit(ParenthesedFromItem parenthesedFromItem, S context) {
        visitorContext.invokeHandlers(parenthesedFromItem);
        return null;
    }

    public VisitorContext getVisitorContext() {
        return visitorContext;
    }
}
