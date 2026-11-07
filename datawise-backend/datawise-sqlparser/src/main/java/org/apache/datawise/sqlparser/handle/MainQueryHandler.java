package org.apache.datawise.sqlparser.handle;

import net.sf.jsqlparser.statement.select.PlainSelect;
import org.apache.datawise.sqlparser.Handler;
import org.apache.datawise.sqlparser.VisitorContext;

/**
 * Base for handlers that must only affect the outermost / main query, not sub-queries.
 * Subclasses implement {@link #apply(PlainSelect, VisitorContext)} which is invoked exactly
 * once, for the {@link VisitorContext#getMainPlainSelect() main plain select}.
 */
public abstract class MainQueryHandler implements Handler<PlainSelect> {

    @Override
    public final void handle(PlainSelect plainSelect, VisitorContext visitorContext) {
        if (plainSelect == null) {
            return;
        }
        PlainSelect main = visitorContext.getMainPlainSelect();
        if (main == null || main != plainSelect) {
            return;
        }
        apply(plainSelect, visitorContext);
        visitorContext.doNotExcuteThisHandlerAgain(this);
    }

    protected abstract void apply(PlainSelect plainSelect, VisitorContext visitorContext);

    @Override
    public Class<? extends PlainSelect> handleType() {
        return PlainSelect.class;
    }
}
