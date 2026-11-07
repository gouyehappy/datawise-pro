package org.apache.datawise.backend.jdbc.execution;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Types;
import java.util.List;
import java.util.Map;

/** JDBC {@code PreparedStatement.addBatch/executeBatch} helper for migration / bulk DML. */
public final class JdbcBatchInsertExecutor {

    private JdbcBatchInsertExecutor() {
    }

    public static int[] execute(
            Connection connection,
            String preparedInsertSql,
            List<String> columnKeys,
            List<Map<String, Object>> rows
    ) throws SQLException {
        if (preparedInsertSql == null || preparedInsertSql.isBlank()) {
            return new int[0];
        }
        if (columnKeys == null || columnKeys.isEmpty()) {
            throw new IllegalArgumentException("Insert requires at least one column");
        }
        if (rows == null || rows.isEmpty()) {
            return new int[0];
        }
        try (PreparedStatement ps = connection.prepareStatement(preparedInsertSql)) {
            for (Map<String, Object> row : rows) {
                for (int i = 0; i < columnKeys.size(); i++) {
                    Object value = row != null ? row.get(columnKeys.get(i)) : null;
                    if (value == null) {
                        ps.setNull(i + 1, Types.NULL);
                    } else {
                        ps.setObject(i + 1, value);
                    }
                }
                ps.addBatch();
            }
            return ps.executeBatch();
        }
    }
}
