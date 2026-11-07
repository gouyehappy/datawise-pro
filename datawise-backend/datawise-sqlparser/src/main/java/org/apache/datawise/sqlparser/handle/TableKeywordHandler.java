package org.apache.datawise.sqlparser.handle;

import net.sf.jsqlparser.schema.Database;
import net.sf.jsqlparser.schema.Table;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.sqlparser.Handler;
import org.apache.datawise.sqlparser.VisitorContext;
import org.apache.datawise.sqlparser.support.IdentifierQuoteSupport;

/** Quote table / schema / catalog identifiers for reserved words and mixed-case names. */
public final class TableKeywordHandler implements Handler<Table> {

    @Override
    public void handle(Table table, VisitorContext visitorContext) {
        if (table == null) {
            return;
        }
        DbType dbType = visitorContext.getDbType();
        if (table.getDatabase() != null) {
            String databaseName = table.getDatabase().getDatabaseName();
            table.setDatabase(new Database(IdentifierQuoteSupport.quoteIdentifier(databaseName, dbType)));
        }
        if (table.getSchemaName() != null) {
            table.setSchemaName(IdentifierQuoteSupport.quoteIdentifier(table.getSchemaName(), dbType));
        }
        if (table.getName() != null) {
            table.setName(IdentifierQuoteSupport.quoteIdentifier(table.getName(), dbType));
        }
    }

    @Override
    public Class<? extends Table> handleType() {
        return Table.class;
    }
}
