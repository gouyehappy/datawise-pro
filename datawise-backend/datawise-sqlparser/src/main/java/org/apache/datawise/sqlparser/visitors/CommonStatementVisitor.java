package org.apache.datawise.sqlparser.visitors;

import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.statement.StatementVisitorAdapter;
import net.sf.jsqlparser.statement.delete.Delete;
import net.sf.jsqlparser.statement.drop.Drop;
import net.sf.jsqlparser.statement.insert.Insert;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import net.sf.jsqlparser.statement.select.SetOperationList;
import net.sf.jsqlparser.statement.select.WithItem;
import net.sf.jsqlparser.statement.update.Update;
import net.sf.jsqlparser.statement.update.UpdateSet;
import org.apache.datawise.sqlparser.VisitorContext;
import org.apache.datawise.sqlparser.support.CollUtil;
import org.apache.datawise.sqlparser.support.VisitorRegistry;

import java.util.List;

public class CommonStatementVisitor extends StatementVisitorAdapter<Void> {

    private final VisitorContext visitorContext;
    private final VisitorRegistry registry;

    public CommonStatementVisitor(VisitorContext visitorContext) {
        this.visitorContext = visitorContext;
        this.registry = visitorContext.visitors();
    }

    @Override
    public <S> Void visit(Select select, S context) {
        visitorContext.runIfActive(() -> {
            visitorContext.setStatement(select);
            resolveMainPlainSelect(select);
            visitorContext.invokeHandlers(select);
            List<WithItem<?>> withItemsList = select.getWithItemsList();
            if (CollUtil.isNotEmpty(withItemsList)) {
                withItemsList.forEach(withItem -> withItem.accept(registry.selectVisitor(), context));
            }
            select.accept(registry.selectVisitor(), context);
        });
        return null;
    }

    private void resolveMainPlainSelect(Select select) {
        if (select instanceof PlainSelect plainSelect) {
            visitorContext.setMainPlainSelect(plainSelect);
            return;
        }
        if (select instanceof SetOperationList setOperationList) {
            List<Select> selects = setOperationList.getSelects();
            if (CollUtil.isNotEmpty(selects)) {
                resolveMainPlainSelect(selects.get(0));
            }
            return;
        }
        PlainSelect plainSelect = select.getPlainSelect();
        if (plainSelect != null) {
            visitorContext.setMainPlainSelect(plainSelect);
        }
    }

    @Override
    public <S> Void visit(Delete delete, S context) {
        visitorContext.runIfActive(() -> {
            visitorContext.invokeHandlers(delete);
            visitTable(delete.getTable(), context);
            visitExpression(delete.getWhere(), context);
        });
        return null;
    }

    @Override
    public <S> Void visit(Update update, S context) {
        visitorContext.runIfActive(() -> {
            visitorContext.invokeHandlers(update);
            visitTable(update.getTable(), context);
            if (update.getUpdateSets() != null) {
                for (UpdateSet updateSet : update.getUpdateSets()) {
                    if (updateSet.getColumns() != null) {
                        for (Column column : updateSet.getColumns()) {
                            visitorContext.invokeHandlers(column);
                        }
                    }
                    if (updateSet.getValues() != null) {
                        updateSet.getValues().forEach(value -> visitExpression(value, context));
                    }
                }
            }
            visitExpression(update.getWhere(), context);
        });
        return null;
    }

    @Override
    public <S> Void visit(Insert insert, S context) {
        visitorContext.runIfActive(() -> {
            visitorContext.invokeHandlers(insert);
            visitTable(insert.getTable(), context);
            if (insert.getColumns() != null) {
                for (Column column : insert.getColumns()) {
                    visitorContext.invokeHandlers(column);
                }
            }
            if (insert.getSelect() != null) {
                insert.getSelect().accept(registry.selectVisitor(), context);
            }
        });
        return null;
    }

    @Override
    public <S> Void visit(Drop drop, S context) {
        visitorContext.runIfActive(() -> visitTable(drop.getName(), context));
        return null;
    }

    private <S> void visitTable(net.sf.jsqlparser.statement.select.FromItem table, S context) {
        if (table != null) {
            table.accept(registry.fromItemVisitor(), context);
        }
    }

    private <S> void visitExpression(net.sf.jsqlparser.expression.Expression expression, S context) {
        if (expression != null) {
            expression.accept(registry.expressionVisitor(), context);
        }
    }
}
