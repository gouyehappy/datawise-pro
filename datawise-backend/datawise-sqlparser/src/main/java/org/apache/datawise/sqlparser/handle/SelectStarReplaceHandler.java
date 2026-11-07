package org.apache.datawise.sqlparser.handle;

import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.statement.select.AllColumns;
import net.sf.jsqlparser.statement.select.AllTableColumns;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.SelectItem;
import org.apache.datawise.sqlparser.VisitorContext;

import java.util.ArrayList;
import java.util.List;

/** Replaces {@code SELECT *} on the main query with an explicit column list. */
public final class SelectStarReplaceHandler extends MainQueryHandler {

    private final List<String> columns;

    public SelectStarReplaceHandler(String... columns) {
        if (columns == null || columns.length == 0) {
            throw new IllegalArgumentException("at least one column is required");
        }
        List<String> normalized = new ArrayList<>();
        for (String column : columns) {
            if (column != null && !column.isBlank()) {
                normalized.add(column.trim());
            }
        }
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("at least one valid column is required");
        }
        this.columns = List.copyOf(normalized);
    }

    @Override
    protected void apply(PlainSelect plainSelect, VisitorContext visitorContext) {
        if (!containsSelectStar(plainSelect)) {
            return;
        }
        List<SelectItem<?>> items = new ArrayList<>(columns.size());
        for (String column : columns) {
            items.add(new SelectItem<>(new Column(column)));
        }
        plainSelect.setSelectItems(items);
    }

    public static boolean containsSelectStar(PlainSelect plainSelect) {
        if (plainSelect == null || plainSelect.getSelectItems() == null) {
            return false;
        }
        for (SelectItem<?> item : plainSelect.getSelectItems()) {
            Expression expression = item.getExpression();
            if (expression instanceof AllColumns || expression instanceof AllTableColumns) {
                return true;
            }
        }
        return false;
    }
}
