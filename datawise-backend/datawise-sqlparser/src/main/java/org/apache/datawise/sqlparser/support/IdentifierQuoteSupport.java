package org.apache.datawise.sqlparser.support;

import net.sf.jsqlparser.statement.select.SelectItem;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.sqlparser.VisitorContext;
import org.apache.datawise.sqlparser.handle.ColumnKeywordHandler;
import org.apache.datawise.sqlparser.handle.SelectAliasKeywordHandler;
import org.apache.datawise.sqlparser.handle.TableKeywordHandler;

public final class IdentifierQuoteSupport {

    private IdentifierQuoteSupport() {
    }

    public static boolean isQuoted(String identifier) {
        if (identifier == null || identifier.length() < 2) {
            return false;
        }
        char first = identifier.charAt(0);
        char last = identifier.charAt(identifier.length() - 1);
        return (first == '`' && last == '`')
                || (first == '"' && last == '"')
                || (first == '[' && last == ']');
    }

    public static String unquote(String identifier) {
        if (identifier == null || identifier.isBlank()) {
            return identifier;
        }
        if (!isQuoted(identifier)) {
            return identifier;
        }
        char quote = identifier.charAt(0);
        String body = identifier.substring(1, identifier.length() - 1);
        return switch (quote) {
            case '`' -> body.replace("``", "`");
            case '"' -> body.replace("\"\"", "\"");
            case '[' -> body.replace("]]", "]");
            default -> body;
        };
    }

    public static String quoteIdentifier(String raw, DbType dbType) {
        if (raw == null || raw.isBlank() || "*".equals(raw)) {
            return raw;
        }
        if (isQuoted(raw)) {
            return raw;
        }
        return dbType.quoteName(unquote(raw));
    }

    public static VisitorContext defaultQuoteContext(DbType dbType) {
        VisitorContext context = new VisitorContext(dbType);
        context.addSqlHandler(net.sf.jsqlparser.schema.Table.class, new TableKeywordHandler());
        context.addSqlHandler(net.sf.jsqlparser.schema.Column.class, new ColumnKeywordHandler());
        context.addSqlHandler(SelectItem.class, new SelectAliasKeywordHandler());
        return context;
    }
}
