package org.apache.datawise.backend.connector.facade.jdbc;

import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TableRowMutateResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.jdbc.support.JdbcConnectionCallback;
import org.apache.datawise.backend.jdbc.execution.JdbcQueryExecutor;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;

/**
 * JDBC 读写入口；database 层经 {@link org.apache.datawise.backend.connector.facade.ConnectorFacade} 访问，不直连 {@link JdbcQueryExecutor}。
 */
@Component
public class ConnectorJdbcAccess {

    private final JdbcQueryExecutor jdbcQueryExecutor;
    private final ConnectorJdbcSessionAccess session;

    public ConnectorJdbcAccess(JdbcQueryExecutor jdbcQueryExecutor, ConnectorJdbcSessionAccess session) {
        this.jdbcQueryExecutor = jdbcQueryExecutor;
        this.session = session;
    }

    public ConnectorJdbcSessionAccess session() {
        return session;
    }

    public ExecuteSqlResult execute(ConnectionEntity entity, String sql, String database, int maxRows) throws SQLException {
        return jdbcQueryExecutor.execute(entity, sql, database, maxRows);
    }

    public ExecuteSqlResult execute(
                                    ConnectionEntity entity,
                                    String sql,
                                    String database,
                                    int maxRows,
                                    String executionKey) throws SQLException {
        return jdbcQueryExecutor.execute(
                entity,
                sql,
                database,
                maxRows,
                executionKey,
                session.executionTracker());
    }

    public ExecuteSqlResult executeSelectPage(
                                              ConnectionEntity entity,
                                              String sql,
                                              String database,
                                              int pageSize,
                                              int offset) throws SQLException {
        return jdbcQueryExecutor.executeSelectPage(entity, sql, database, pageSize, offset);
    }

    public ExecuteSqlResult executeSelectPage(
                                              ConnectionEntity entity,
                                              String sql,
                                              String database,
                                              int pageSize,
                                              int offset,
                                              String executionKey) throws SQLException {
        return jdbcQueryExecutor.executeSelectPage(
                entity,
                sql,
                database,
                pageSize,
                offset,
                executionKey,
                session.executionTracker());
    }

    public ExecuteSqlResult executeOnConnection(Connection connection, String sql, int maxRows) throws SQLException {
        return jdbcQueryExecutor.executeOnConnection(connection, sql, maxRows);
    }

    public ExecuteSqlResult executeOnConnection(
                                                Connection connection,
                                                String sql,
                                                int maxRows,
                                                String executionKey) throws SQLException {
        return jdbcQueryExecutor.executeOnConnection(
                connection,
                sql,
                maxRows,
                executionKey,
                session.executionTracker());
    }

    public TableRowMutateResult executeUpdate(ConnectionEntity entity, String sql, String database) throws SQLException {
        return jdbcQueryExecutor.executeUpdate(entity, sql, database);
    }

    public ExecuteSqlResult executeSelectPageOnConnection(
                                                          Connection connection,
                                                          String dbType,
                                                          String sql,
                                                          int pageSize,
                                                          int offset) throws SQLException {
        return jdbcQueryExecutor.executeSelectPageOnConnection(connection, dbType, sql, pageSize, offset);
    }

    /** Migration page fetch: preserve JDBC cell types (no UI truncation). */
    public ExecuteSqlResult executeSelectPageForMigrationOnConnection(
                                                                      Connection connection,
                                                                      String dbType,
                                                                      String sql,
                                                                      int pageSize,
                                                                      int offset) throws SQLException {
        return jdbcQueryExecutor.executeSelectPageForMigrationOnConnection(
                connection, dbType, sql, pageSize, offset);
    }

    public TableRowMutateResult executeUpdateOnConnection(Connection connection, String sql) throws SQLException {
        return jdbcQueryExecutor.executeUpdateOnConnection(connection, sql);
    }

    public int[] executeBatchInsertOnConnection(
                                                Connection connection,
                                                String preparedInsertSql,
                                                List<String> columnKeys,
                                                List<Map<String, Object>> rows) throws SQLException {
        return jdbcQueryExecutor.executeBatchInsertOnConnection(connection, preparedInsertSql, columnKeys, rows);
    }

    public <T> T withConnection(
                                ConnectionEntity entity,
                                String database,
                                JdbcConnectionCallback<T> callback) throws SQLException {
        return jdbcQueryExecutor.withConnection(entity, database, callback);
    }

    /** Opens a pooled connection with catalog/schema applied (caller must close). */
    public Connection openPreparedConnection(ConnectionEntity entity, String database) throws SQLException {
        return jdbcQueryExecutor.openPreparedConnection(entity, database);
    }

    public TableDataResult fetchTable(
                                      ConnectionEntity entity,
                                      String tableName,
                                      String database,
                                      int maxRows,
                                      int offset) throws SQLException {
        return jdbcQueryExecutor.fetchTable(entity, tableName, database, maxRows, offset);
    }

    public String buildTableSelectSql(ConnectionEntity entity, String tableName, String database) {
        return jdbcQueryExecutor.buildTableSelectSql(entity, tableName, database);
    }

    public long countTableRows(
                               ConnectionEntity entity,
                               String tableName,
                               String database,
                               String whereClause) throws SQLException {
        return jdbcQueryExecutor.countTableRows(entity, tableName, database, whereClause);
    }
}
