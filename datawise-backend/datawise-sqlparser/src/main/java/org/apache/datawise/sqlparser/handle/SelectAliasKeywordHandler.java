package org.apache.datawise.sqlparser.handle;

import net.sf.jsqlparser.expression.Alias;
import net.sf.jsqlparser.statement.select.SelectItem;
import org.apache.datawise.sqlparser.Handler;
import org.apache.datawise.sqlparser.VisitorContext;
import org.apache.datawise.sqlparser.support.IdentifierQuoteSupport;

/** Quote SELECT item aliases when present. */
public final class SelectAliasKeywordHandler implements Handler<Object> {

    @Override
    public void handle(Object obj, VisitorContext visitorContext) {
        if (!(obj instanceof SelectItem<?> item)) {
            return;
        }
        Alias alias = item.getAlias();
        if (alias == null || alias.getName() == null) {
            return;
        }
        alias.setName(IdentifierQuoteSupport.quoteIdentifier(alias.getName(), visitorContext.getDbType()));
    }

    @Override
    public Class<?> handleType() {
        return SelectItem.class;
    }
}
