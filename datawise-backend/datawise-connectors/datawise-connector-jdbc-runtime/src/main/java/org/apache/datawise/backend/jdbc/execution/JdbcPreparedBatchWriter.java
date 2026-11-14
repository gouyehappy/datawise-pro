package org.apache.datawise.backend.jdbc.execution;

import org.apache.datawise.backend.jdbc.stream.JdbcBatchWriter;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * MetaForge A1：基于 PreparedStatement 的分批写入；失败时 clearBatch + rollback（无事务则降级）。
 */
public final class JdbcPreparedBatchWriter implements JdbcBatchWriter {

    private final Connection connection;
    private final PreparedStatement statement;
    private final List<String> columnKeys;
    private final int batchSize;
    private final boolean transactional;
    private int buffered;

    public JdbcPreparedBatchWriter(
            Connection connection,
            String preparedInsertSql,
            List<String> columnKeys,
            int batchSize
    ) throws SQLException {
        if (connection == null) {
            throw new IllegalArgumentException("connection is required");
        }
        if (preparedInsertSql == null || preparedInsertSql.isBlank()) {
            throw new IllegalArgumentException("preparedInsertSql is required");
        }
        if (columnKeys == null || columnKeys.isEmpty()) {
            throw new IllegalArgumentException("columnKeys is required");
        }
        this.connection = connection;
        this.columnKeys = List.copyOf(columnKeys);
        this.batchSize = Math.max(1, batchSize);
        this.statement = connection.prepareStatement(preparedInsertSql);
        boolean tx;
        try {
            tx = connection.getMetaData().supportsTransactions();
        } catch (SQLException ex) {
            tx = false;
        }
        this.transactional = tx;
        if (transactional) {
            connection.setAutoCommit(false);
        }
    }

    @Override
    public void addRow(Map<String, Object> row) throws SQLException {
        for (int i = 0; i < columnKeys.size(); i++) {
            Object value = row != null ? row.get(columnKeys.get(i)) : null;
            if (value == null) {
                statement.setNull(i + 1, Types.NULL);
            } else {
                statement.setObject(i + 1, value);
            }
        }
        statement.addBatch();
        buffered++;
        if (buffered >= batchSize) {
            flush();
        }
    }

    @Override
    public void flush() throws SQLException {
        if (buffered == 0) {
            return;
        }
        try {
            statement.executeBatch();
            if (transactional) {
                connection.commit();
            }
            buffered = 0;
        } catch (SQLException ex) {
            try {
                statement.clearBatch();
            } catch (SQLException ignored) {
                // keep original
            }
            if (transactional) {
                try {
                    connection.rollback();
                } catch (SQLException ignored) {
                    // keep original
                }
            }
            buffered = 0;
            throw ex;
        }
    }

    @Override
    public void close() throws SQLException {
        try {
            flush();
        } finally {
            statement.close();
            if (transactional) {
                try {
                    connection.setAutoCommit(true);
                } catch (SQLException ignored) {
                    // best-effort restore
                }
            }
        }
    }

    /** Test helper: keys in bind order. */
    List<String> columnKeys() {
        return new ArrayList<>(columnKeys);
    }
}
