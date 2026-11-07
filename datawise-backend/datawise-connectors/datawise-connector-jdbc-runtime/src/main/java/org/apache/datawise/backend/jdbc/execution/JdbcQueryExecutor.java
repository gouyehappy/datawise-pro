package org.apache.datawise.backend.jdbc.execution;

import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TableRowMutateResult;
import org.apache.datawise.backend.jdbc.connection.JdbcConnectionAccessor;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.jdbc.support.JdbcConnectionCallback;
import org.apache.datawise.backend.jdbc.support.SqlExecutionTracker;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;

/** JDBC query facade: connection access, statement execution, table reads. */
@Component
public class JdbcQueryExecutor {

    private final JdbcConnectionAccessor connectionAccessor;
    private final JdbcStatementExecutor statementExecutor;
    private final JdbcTableDataReader tableDataReader;

    public JdbcQueryExecutor(
            JdbcConnectionAccessor connectionAccessor,
            JdbcStatementExecutor statementExecutor,
            JdbcTableDataReader tableDataReader
    ) {
        this.connectionAccessor = connectionAccessor;
        this.statementExecutor = statementExecutor;
        this.tableDataReader = tableDataReader;
    }

    public boolean canConnect(ConnectionEntity entity) throws SQLException {
        return connectionAccessor.canConnect(entity);
    }

    public ExecuteSqlResult execute(ConnectionEntity entity, String sql, String database, int maxRows) throws SQLException {
        return execute(entity, sql, database, maxRows, null, null);
    }

    public ExecuteSqlResult execute(
            ConnectionEntity entity,
            String sql,
            String database,
            int maxRows,
            String executionKey,
            SqlExecutionTracker tracker
    ) throws SQLException {
        long startedAt = System.currentTimeMillis();
        ExecuteSqlResult result = connectionAccessor.withConnection(
                entity,
                database,
                connection -> statementExecutor.executeOnConnection(connection, sql, maxRows, executionKey, tracker)
        );
        return JdbcStatementExecutor.withWallClockDuration(result, System.currentTimeMillis() - startedAt);
    }

    public ExecuteSqlResult executeOnConnection(Connection connection, String sql, int maxRows) throws SQLException {
        return statementExecutor.executeOnConnection(connection, sql, maxRows);
    }

    public ExecuteSqlResult executeOnConnection(
            Connection connection,
            String sql,
            int maxRows,
            String executionKey,
            SqlExecutionTracker tracker
    ) throws SQLException {
        return statementExecutor.executeOnConnection(connection, sql, maxRows, executionKey, tracker);
    }

    public ExecuteSqlResult executeSelectPage(
            ConnectionEntity entity,
            String sql,
            String database,
            int pageSize,
            int offset
    ) throws SQLException {
        return executeSelectPage(entity, sql, database, pageSize, offset, null, null);
    }

    public ExecuteSqlResult executeSelectPage(
            ConnectionEntity entity,
            String sql,
            String database,
            int pageSize,
            int offset,
            String executionKey,
            SqlExecutionTracker tracker
    ) throws SQLException {
        return tableDataReader.executeSelectPage(entity, sql, database, pageSize, offset, executionKey, tracker);
    }

    public ExecuteSqlResult executeSelectPageOnConnection(
            Connection connection,
            String dbType,
            String sql,
            int pageSize,
            int offset
    ) throws SQLException {
        return tableDataReader.executeSelectPageOnConnection(connection, dbType, sql, pageSize, offset);
    }

    public ExecuteSqlResult executeSelectPageForMigrationOnConnection(
            Connection connection,
            String dbType,
            String sql,
            int pageSize,
            int offset
    ) throws SQLException {
        return tableDataReader.executeSelectPageForMigrationOnConnection(
                connection, dbType, sql, pageSize, offset);
    }

    public ExecuteSqlResult executeSelectPageOnConnection(
            Connection connection,
            String dbType,
            String sql,
            int pageSize,
            int offset,
            String executionKey,
            SqlExecutionTracker tracker
    ) throws SQLException {
        return tableDataReader.executeSelectPageOnConnection(
                connection, dbType, sql, pageSize, offset, executionKey, tracker
        );
    }

    public Connection openConnection(ConnectionEntity entity) throws SQLException {
        return connectionAccessor.openConnection(entity);
    }

    public void evictPool(String connectionId) {
        connectionAccessor.evictPool(connectionId);
    }

    public Connection openPreparedConnection(ConnectionEntity entity, String database) throws SQLException {
        return connectionAccessor.openPreparedConnection(entity, database);
    }

    public <T> T withConnection(
            ConnectionEntity entity,
            String database,
            JdbcConnectionCallback<T> callback
    ) throws SQLException {
        return connectionAccessor.withConnection(entity, database, callback);
    }

    public void applyCatalog(Connection connection, String dbType, String database) throws SQLException {
        connectionAccessor.applyCatalog(connection, dbType, database);
    }

    public String buildTableSelectSql(ConnectionEntity entity, String tableName, String database) {
        return tableDataReader.buildTableSelectSql(entity, tableName, database);
    }

    public TableDataResult fetchTable(
            ConnectionEntity entity,
            String tableName,
            String database,
            int maxRows,
            int offset
    ) throws SQLException {
        return tableDataReader.fetchTable(entity, tableName, database, maxRows, offset);
    }

    public TableDataResult fetchTable(ConnectionEntity entity, String tableName, String database, int maxRows)
            throws SQLException {
        return tableDataReader.fetchTable(entity, tableName, database, maxRows);
    }

    public TableRowMutateResult executeUpdate(ConnectionEntity entity, String sql, String database) throws SQLException {
        String trimmed = sql != null ? sql.trim() : "";
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("SQL is required");
        }
        return connectionAccessor.withConnection(
                entity,
                database,
                connection -> statementExecutor.executeUpdate(connection, trimmed)
        );
    }

    public TableRowMutateResult executeUpdateOnConnection(Connection connection, String sql) throws SQLException {
        return statementExecutor.executeUpdate(connection, sql);
    }

    public int[] executeBatchInsertOnConnection(
            Connection connection,
            String preparedInsertSql,
            List<String> columnKeys,
            List<Map<String, Object>> rows
    ) throws SQLException {
        return JdbcBatchInsertExecutor.execute(connection, preparedInsertSql, columnKeys, rows);
    }

    public TableDataResult fetchBySql(ConnectionEntity entity, String sql) throws SQLException {
        return tableDataReader.fetchBySql(entity, sql);
    }

    public long countTableRows(
            ConnectionEntity entity,
            String tableName,
            String database,
            String whereClause
    ) throws SQLException {
        return tableDataReader.countTableRows(entity, tableName, database, whereClause);
    }

    public String guessTableName(String sql) {
        return tableDataReader.guessTableName(sql);
    }
}
