package org.apache.datawise.sqlparser.handle;

import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.select.OrderByElement;
import net.sf.jsqlparser.statement.select.PlainSelect;
import org.apache.datawise.sqlparser.VisitorContext;

import java.util.ArrayList;
import java.util.List;

/**
 * Appends an {@code ORDER BY} clause to the main query when it has none — the stable-ordering
 * requirement behind keyset / cursor pagination. If the query already declares an ORDER BY it is
 * left untouched, so caller intent is never overridden.
 */
public final class OrderByHandler extends MainQueryHandler {

    private final List<OrderByElement> orderByElements = new ArrayList<>();

    public OrderByHandler(boolean asc, String... columns) throws JSQLParserException {
        if (columns == null || columns.length == 0) {
            throw new IllegalArgumentException("at least one order-by column is required");
        }
        for (String column : columns) {
            if (column == null || column.isBlank()) {
                continue;
            }
            OrderByElement element = new OrderByElement();
            element.setExpression(CCJSqlParserUtil.parseExpression(column));
            element.setAsc(asc);
            element.setAscDescPresent(true);
            orderByElements.add(element);
        }
        if (orderByElements.isEmpty()) {
            throw new IllegalArgumentException("no valid order-by column supplied");
        }
    }

    @Override
    protected void apply(PlainSelect plainSelect, VisitorContext visitorContext) {
        List<OrderByElement> existing = plainSelect.getOrderByElements();
        if (existing != null && !existing.isEmpty()) {
            return;
        }
        plainSelect.setOrderByElements(new ArrayList<>(orderByElements));
    }
}
