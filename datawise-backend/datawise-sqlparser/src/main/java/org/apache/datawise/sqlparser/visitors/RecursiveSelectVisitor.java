package org.apache.datawise.sqlparser.visitors;

import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.statement.select.FromItem;
import net.sf.jsqlparser.statement.select.OrderByElement;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import net.sf.jsqlparser.statement.select.SelectItem;
import net.sf.jsqlparser.statement.select.SetOperationList;
import net.sf.jsqlparser.statement.select.WithItem;
import org.apache.datawise.sqlparser.VisitorContext;
import org.apache.datawise.sqlparser.support.CollUtil;
import org.apache.datawise.sqlparser.support.SelectTraversalSupport;
import org.apache.datawise.sqlparser.support.VisitorRegistry;

import java.util.Locale;

/** Recursively walks SELECT AST nodes and dispatches handlers. */
public class RecursiveSelectVisitor extends CommonSelectVisitor {

    private final VisitorRegistry registry;

    public RecursiveSelectVisitor(VisitorContext visitorContext, VisitorRegistry registry) {
        super(visitorContext);
        this.registry = registry;
    }

    @Override
    public <S> Void visit(PlainSelect plainSelect, S context) {
        visitorContext.runIfActive(() -> walkPlainSelect(plainSelect, context));
        return null;
    }

    private <S> void walkPlainSelect(PlainSelect plainSelect, S context) {
        visitorContext.pushPlainSelect(plainSelect);
        super.visit(plainSelect, context);

        FromItem fromItem = plainSelect.getFromItem();
        if (fromItem != null) {
            fromItem.accept(registry.fromItemVisitor(), context);
        }

        SelectTraversalSupport.walkJoins(
                plainSelect.getJoins(),
                registry.fromItemVisitor(),
                registry.expressionVisitor(),
                context
        );

        if (plainSelect.getSelectItems() != null) {
            for (SelectItem<?> item : plainSelect.getSelectItems()) {
                item.accept(registry.selectItemVisitor(), context);
            }
        }

        Expression where = plainSelect.getWhere();
        if (where != null) {
            where.accept(registry.expressionVisitor(), context);
        }

        if (plainSelect.getOrderByElements() != null) {
            for (OrderByElement orderByElement : plainSelect.getOrderByElements()) {
                orderByElement.getExpression().accept(registry.expressionVisitor(), context);
            }
        }

        if (plainSelect.getGroupBy() != null && plainSelect.getGroupBy().getGroupByExpressions() != null) {
            for (Object groupByExpression : plainSelect.getGroupBy().getGroupByExpressions()) {
                if (groupByExpression instanceof Expression expression) {
                    expression.accept(registry.expressionVisitor(), context);
                }
            }
        }

        Expression having = plainSelect.getHaving();
        if (having != null) {
            having.accept(registry.expressionVisitor(), context);
        }

        visitorContext.popPlainSelect();
    }

    @Override
    public <S> Void visit(SetOperationList setOpList, S context) {
        super.visit(setOpList, context);
        if (CollUtil.isNotEmpty(setOpList.getSelects())) {
            for (Select select : setOpList.getSelects()) {
                select.accept(this, context);
            }
        }
        return null;
    }

    @Override
    public <S> Void visit(WithItem<?> withItem, S context) {
        super.visit(withItem, context);
        String tableName = withItem.getAliasName();
        if (tableName != null) {
            visitorContext.ensureTmpWithTableNameSets().add(tableName.toLowerCase(Locale.ROOT));
        }
        Select select = withItem.getSelect();
        if (select != null) {
            select.accept(this, context);
        }
        if (CollUtil.isNotEmpty(withItem.getWithItemList())) {
            for (SelectItem<?> item : withItem.getWithItemList()) {
                item.accept(registry.selectItemVisitor(), context);
            }
        }
        return null;
    }
}
