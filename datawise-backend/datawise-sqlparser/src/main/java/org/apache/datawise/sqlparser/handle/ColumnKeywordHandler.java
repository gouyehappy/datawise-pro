package org.apache.datawise.sqlparser.handle;

import net.sf.jsqlparser.schema.Column;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.sqlparser.Handler;
import org.apache.datawise.sqlparser.VisitorContext;
import org.apache.datawise.sqlparser.support.IdentifierQuoteSupport;

/** Quote column identifiers. */
public final class ColumnKeywordHandler implements Handler<Column> {

    @Override
    public void handle(Column column, VisitorContext visitorContext) {
        if (column == null) {
            return;
        }
        DbType dbType = visitorContext.getDbType();
        if (column.getTable() != null && column.getTable().getName() != null) {
            column.getTable().setName(IdentifierQuoteSupport.quoteIdentifier(column.getTable().getName(), dbType));
        }
        if (column.getColumnName() != null) {
            column.setColumnName(IdentifierQuoteSupport.quoteIdentifier(column.getColumnName(), dbType));
        }
    }

    @Override
    public Class<? extends Column> handleType() {
        return Column.class;
    }
}
