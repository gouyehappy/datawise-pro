package org.apache.datawise.backend.jdbc.stream;

import java.sql.SQLException;
import java.util.Map;

/**
 * MetaForge A1：分批写入契约。实现侧负责攒批、commit/rollback 与无事务引擎降级。
 */
public interface JdbcBatchWriter extends AutoCloseable {

    void addRow(Map<String, Object> row) throws SQLException;

    /** Flush any buffered rows (commit when the connection supports it). */
    void flush() throws SQLException;

    @Override
    void close() throws SQLException;
}
