package org.apache.datawise.sqlparser.handle;

import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.LongValue;
import net.sf.jsqlparser.statement.select.Limit;
import net.sf.jsqlparser.statement.select.PlainSelect;
import org.apache.datawise.sqlparser.VisitorContext;

/**
 * Ensures the main query never returns more than {@code maxRows}. Replaces the string-based
 * row-limit logic scattered across the pagination dialects for the common {@code LIMIT n} case.
 *
 * <ul>
 *   <li>No existing LIMIT: adds {@code LIMIT maxRows}.</li>
 *   <li>Existing numeric LIMIT larger than {@code maxRows} (and {@code capExisting}): lowers it.</li>
 *   <li>Existing LIMIT within the cap: left untouched.</li>
 * </ul>
 */
public final class LimitHandler extends MainQueryHandler {

    private final long maxRows;
    private final boolean capExisting;

    public LimitHandler(long maxRows) {
        this(maxRows, true);
    }

    public LimitHandler(long maxRows, boolean capExisting) {
        if (maxRows < 0) {
            throw new IllegalArgumentException("maxRows must not be negative: " + maxRows);
        }
        this.maxRows = maxRows;
        this.capExisting = capExisting;
    }

    @Override
    protected void apply(PlainSelect plainSelect, VisitorContext visitorContext) {
        Limit existing = plainSelect.getLimit();
        if (existing == null) {
            plainSelect.setLimit(new Limit().withRowCount(new LongValue(maxRows)));
            return;
        }
        if (!capExisting || existing.isLimitAll()) {
            return;
        }
        Expression rowCount = existing.getRowCount();
        if (rowCount == null) {
            existing.setRowCount(new LongValue(maxRows));
        } else if (rowCount instanceof LongValue longValue && longValue.getValue() > maxRows) {
            existing.setRowCount(new LongValue(maxRows));
        }
    }
}
