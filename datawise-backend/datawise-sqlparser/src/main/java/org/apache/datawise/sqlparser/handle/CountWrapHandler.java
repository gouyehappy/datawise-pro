package org.apache.datawise.sqlparser.handle;

import net.sf.jsqlparser.expression.Function;
import net.sf.jsqlparser.expression.operators.relational.ExpressionList;
import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.statement.select.Distinct;
import net.sf.jsqlparser.statement.select.GroupByElement;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import net.sf.jsqlparser.statement.select.SelectItem;
import net.sf.jsqlparser.statement.select.SetOperationList;
import org.apache.datawise.sqlparser.Handler;
import org.apache.datawise.sqlparser.VisitorContext;

import java.util.List;

/** Replaces the outer SELECT list with {@code COUNT(*)} or wraps in a count subquery when needed. */
public final class CountWrapHandler implements Handler<Select> {

    @Override
    public void handle(Select select, VisitorContext visitorContext) {
        if (select == null || select instanceof SetOperationList) {
            return;
        }
        PlainSelect main = visitorContext.getMainPlainSelect();
        if (main != null && canReplaceInPlace(main)) {
            replaceWithCount(main);
            return;
        }
        if (select instanceof PlainSelect plainSelect && canReplaceInPlace(plainSelect)) {
            replaceWithCount(plainSelect);
            return;
        }
        visitorContext.stopVisiting();
    }

    public static String wrapCountSubquery(String sql) {
        String body = sql == null ? "" : sql.trim();
        if (body.isBlank()) {
            return body;
        }
        return "SELECT COUNT(*) FROM (" + body + ") AS _dw_count";
    }

    private static boolean canReplaceInPlace(PlainSelect plainSelect) {
        if (plainSelect == null) {
            return false;
        }
        Distinct distinct = plainSelect.getDistinct();
        if (distinct != null) {
            return false;
        }
        GroupByElement groupBy = plainSelect.getGroupBy();
        if (groupBy != null && groupBy.getGroupByExpressionList() != null
                && !groupBy.getGroupByExpressionList().isEmpty()) {
            return false;
        }
        return true;
    }

    private static void replaceWithCount(PlainSelect plainSelect) {
        Function count = new Function();
        count.setName("COUNT");
        count.setParameters(new ExpressionList<>(new Column("*")));
        SelectItem<?> item = new SelectItem<>(count);
        plainSelect.setSelectItems(List.of(item));
    }

    @Override
    public Class<? extends Select> handleType() {
        return Select.class;
    }
}
