package org.apache.datawise.sqlparser.support;

import net.sf.jsqlparser.JSQLParserException;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.sqlparser.SqlTransform;

/** Builds common table-oriented SELECT statements. */
public final class SqlTableSelectSupport {

    private SqlTableSelectSupport() {
    }

    public static String buildSelectAll(String dbTypeId, String database, String tableName) {
        String qualified = DbType.quoteQualifiedTable(DbType.normalizeId(dbTypeId), database, tableName);
        return selectAllFrom(qualified, dbTypeId);
    }

    public static String selectAllFrom(String fromItem) {
        return selectAllFrom(fromItem, "mysql");
    }

    public static String selectAllFrom(String fromItem, String dbTypeId) {
        if (fromItem == null || fromItem.isBlank()) {
            throw new IllegalArgumentException("fromItem is required");
        }
        String sql = "SELECT * FROM " + fromItem.trim();
        try {
            return SqlTransform.of(sql, dbTypeId).quoteIdentifiers().toSql();
        } catch (JSQLParserException ignored) {
            return sql;
        }
    }
}
