package org.apache.datawise.sqlparser.analysis;

import net.sf.jsqlparser.expression.Alias;
import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.schema.Table;
import net.sf.jsqlparser.statement.select.SelectItem;
import org.apache.datawise.sqlparser.Handler;
import org.apache.datawise.sqlparser.VisitorContext;

/** Collects referenced tables, alias map, and column references into {@link SqlAnalysisResult}. */
public final class SqlAnalysisHandlers {

    private SqlAnalysisHandlers() {
    }

    public static Handler<?>[] all(SqlAnalysisResult result) {
        return new Handler<?>[] {
                tableHandler(result),
                aliasHandler(result),
                selectAliasHandler(result),
                columnHandler(result)
        };
    }

    private static Handler<Table> tableHandler(SqlAnalysisResult result) {
        return new Handler<>() {
            @Override
            public void handle(Table table, VisitorContext visitorContext) {
                if (table == null || table.getName() == null) {
                    return;
                }
                result.addTable(table.getName());
            }

            @Override
            public Class<? extends Table> handleType() {
                return Table.class;
            }
        };
    }

    private static Handler<Table> aliasHandler(SqlAnalysisResult result) {
        return new Handler<>() {
            @Override
            public void handle(Table table, VisitorContext visitorContext) {
                if (table == null || table.getName() == null) {
                    return;
                }
                Alias alias = table.getAlias();
                String aliasName = alias != null ? alias.getName() : null;
                result.addAlias(aliasName, table.getName());
            }

            @Override
            public Class<? extends Table> handleType() {
                return Table.class;
            }
        };
    }

    private static Handler<SelectItem<?>> selectAliasHandler(SqlAnalysisResult result) {
        return new Handler<>() {
            @Override
            public void handle(SelectItem<?> selectItem, VisitorContext visitorContext) {
                if (selectItem == null) {
                    return;
                }
                Alias alias = selectItem.getAlias();
                if (alias != null && alias.getName() != null) {
                    result.addSelectAlias(alias.getName());
                } else if (selectItem.getAliasName() != null) {
                    result.addSelectAlias(selectItem.getAliasName());
                }
            }

            @Override
            @SuppressWarnings("unchecked")
            public Class<? extends SelectItem<?>> handleType() {
                return (Class<? extends SelectItem<?>>) (Class<?>) SelectItem.class;
            }
        };
    }

    private static Handler<Column> columnHandler(SqlAnalysisResult result) {
        return new Handler<>() {
            @Override
            public void handle(Column column, VisitorContext visitorContext) {
                if (column == null) {
                    return;
                }
                String columnName = column.getColumnName();
                if (columnName == null || columnName.isBlank() || "*".equals(columnName)) {
                    return;
                }
                Table table = column.getTable();
                if (table != null && table.getName() != null && !table.getName().isBlank()) {
                    result.addQualifiedColumn(table.getName(), columnName);
                    return;
                }
                result.addUnqualifiedColumn(columnName);
            }

            @Override
            public Class<? extends Column> handleType() {
                return Column.class;
            }
        };
    }
}
