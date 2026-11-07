package org.apache.datawise.sqlparser.support;

import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.ExpressionVisitor;
import net.sf.jsqlparser.statement.select.FromItem;
import net.sf.jsqlparser.statement.select.FromItemVisitor;
import net.sf.jsqlparser.statement.select.Join;
import net.sf.jsqlparser.statement.select.ParenthesedSelect;
import net.sf.jsqlparser.statement.select.Select;
import net.sf.jsqlparser.statement.select.WithItem;

import java.util.List;

/** Shared SELECT / FROM traversal helpers. */
public final class SelectTraversalSupport {

    private SelectTraversalSupport() {
    }

    public static FromItem joinFromItem(Join join) {
        if (join == null) {
            return null;
        }
        FromItem fromItem = join.getFromItem();
        return fromItem != null ? fromItem : join.getRightItem();
    }

    public static <S> void walkJoins(
            List<Join> joins,
            FromItemVisitor<Void> fromItemVisitor,
            ExpressionVisitor<Void> expressionVisitor,
            S context
    ) {
        if (joins == null) {
            return;
        }
        for (Join join : joins) {
            FromItem rightItem = joinFromItem(join);
            if (rightItem != null) {
                rightItem.accept(fromItemVisitor, context);
            }
            Expression onExpression = join.getOnExpression();
            if (onExpression != null) {
                onExpression.accept(expressionVisitor, context);
            }
        }
    }

    public static <S> void walkParenthesedSelect(
            ParenthesedSelect parenthesedSelect,
            VisitorRegistry registry,
            S context
    ) {
        if (parenthesedSelect == null) {
            return;
        }
        List<WithItem<?>> withItems = parenthesedSelect.getWithItemsList();
        if (CollUtil.isNotEmpty(withItems)) {
            for (WithItem<?> withItem : withItems) {
                withItem.accept(registry.selectVisitor(), context);
            }
        }
        Select select = parenthesedSelect.getSelect() != null ? parenthesedSelect.getSelect() : parenthesedSelect;
        select.accept(registry.selectVisitor(), context);
    }
}
