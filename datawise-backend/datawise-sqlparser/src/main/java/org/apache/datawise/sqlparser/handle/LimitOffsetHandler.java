package org.apache.datawise.sqlparser.handle;

import net.sf.jsqlparser.expression.LongValue;
import net.sf.jsqlparser.statement.select.Limit;
import net.sf.jsqlparser.statement.select.PlainSelect;
import org.apache.datawise.sqlparser.VisitorContext;

/**
 * Applies {@code LIMIT limit [OFFSET offset]} on the outer query. Replaces any existing LIMIT/OFFSET.
 */
public final class LimitOffsetHandler extends MainQueryHandler {

    private final long limit;
    private final long offset;

    public LimitOffsetHandler(long limit, long offset) {
        if (limit <= 0) {
            throw new IllegalArgumentException("limit must be positive: " + limit);
        }
        if (offset < 0) {
            throw new IllegalArgumentException("offset must not be negative: " + offset);
        }
        this.limit = limit;
        this.offset = offset;
    }

    @Override
    protected void apply(PlainSelect plainSelect, VisitorContext visitorContext) {
        Limit limitObj = new Limit().withRowCount(new LongValue(limit));
        if (offset > 0) {
            limitObj.setOffset(new LongValue(offset));
        }
        plainSelect.setLimit(limitObj);
        plainSelect.setOffset(null);
    }
}
