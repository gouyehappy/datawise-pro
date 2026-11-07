package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;
import org.apache.datawise.sqlparser.SqlTransform;
import org.apache.datawise.sqlparser.SqlTransformOps;

import net.sf.jsqlparser.JSQLParserException;

import java.util.Map;
import java.util.stream.Collectors;

final class TableDataAuditSql {

    private TableDataAuditSql() {
    }

    static String buildSelectByPrimaryKey(
            String dbTypeId,
            String database,
            String tableName,
            Map<String, Object> primaryKeyValues
    ) {
        if (primaryKeyValues == null || primaryKeyValues.isEmpty()) {
            throw new IllegalArgumentException("primaryKeyValues is required");
        }
        String table = DbType.quoteQualifiedTable(dbTypeId, database, tableName);
        String where = primaryKeyValues.entrySet().stream()
                .map(entry -> DbType.quoteIdentifier(dbTypeId, entry.getKey())
                        + " = "
                        + DmlSqlSupport.sqlLiteral(entry.getValue()))
                .collect(Collectors.joining(" AND "));
        String sql = SqlTransformOps.appendWhere(SqlTransformOps.selectAllFrom(table, dbTypeId), where);
        try {
            return SqlTransform.of(sql, dbTypeId).limit(1).toSql();
        } catch (JSQLParserException ignored) {
            return sql + " LIMIT 1";
        }
    }
}
