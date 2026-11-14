package org.apache.datawise.backend.jdbc.execution;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.common.SqlDeepOffsetException;
import org.apache.datawise.backend.config.JdbcPoolProperties;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.jdbc.support.SqlServerCatalogSupport;
import org.apache.datawise.sqlparser.SqlTransformOps;
import org.apache.datawise.sqlparser.support.SqlTableSelectSupport;
import org.apache.datawise.backend.jdbc.connection.JdbcConnectionAccessor;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.sql.spi.SqlPaginationService;
import org.apache.datawise.backend.jdbc.support.MigrationWhereSupport;
import org.apache.datawise.backend.jdbc.support.SqlExecutionTracker;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Table-oriented read helpers: SELECT builders, paging, row count and ad-hoc SQL fetch.
 */
@Component
public class JdbcTableDataReader {

    private static final Logger log = LoggerFactory.getLogger(JdbcTableDataReader.class);

    private static final Pattern FROM_PATTERN = Pattern.compile("\\bfrom\\s+[`\"'\\[]?(\\w+)", Pattern.CASE_INSENSITIVE);

    private final JdbcConnectionAccessor connectionAccessor;
    private final JdbcPoolProperties poolProperties;
    private final SqlPaginationService paginationService;
    private final int queryTimeoutSeconds;
    private final int maxCursorOffset;

    public JdbcTableDataReader(
            JdbcConnectionAccessor connectionAccessor,
            JdbcPoolProperties poolProperties,
            @Autowired(required = false) SqlPaginationService paginationService,
            @Value("${datawise.query.timeout-seconds:0}") int queryTimeoutSeconds,
            @Value("${datawise.query.max-cursor-offset:100000}") int maxCursorOffset
    ) {
        this.connectionAccessor = connectionAccessor;
        this.poolProperties = poolProperties != null ? poolProperties : new JdbcPoolProperties();
        this.paginationService = paginationService != null ? paginationService : FallbackSqlPaginationService.INSTANCE;
        this.queryTimeoutSeconds = Math.max(0, queryTimeoutSeconds);
        this.maxCursorOffset = Math.max(0, maxCursorOffset);
    }

    /** Builds dialect-aware {@code SELECT *} for table browsing and migration source reads. */
    public String buildTableSelectSql(ConnectionEntity entity, String tableName, String database) {
        String dbType = DbType.normalizeId(entity.getDbType());
        return SqlTransformOps.buildSelectAll(dbType, database, tableName);
    }

    /** Fetches table rows with optional limit/offset pagination. */
    public TableDataResult fetchTable(
            ConnectionEntity entity,
            String tableName,
            String database,
            int maxRows,
            int offset
    ) throws SQLException {
        requireOffsetWithinLimit(offset);
        String dbType = DbType.normalizeId(entity.getDbType());
        if (maxRows > 0) {
            try {
                return connectionAccessor.withConnection(
                        entity,
                        database,
                        connection -> {
                            String sql = buildTableSelectSql(connection, entity, tableName, database);
                            sql = paginationService.applyLimitOffset(
                                    sql,
                                    dbType,
                                    maxRows + 1,
                                    Math.max(0, offset)
                            );
                            return queryLimited(connection, sql, maxRows);
                        }
                );
            } catch (SQLException ex) {
                log.warn("fetchTable failed dbType={} table={} database={}",
                        dbType, tableName, database, ex);
                throw ex;
            }
        }
        return connectionAccessor.withConnection(
                entity,
                database,
                connection -> queryAll(connection, buildTableSelectSql(connection, entity, tableName, database))
        );
    }

    public TableDataResult fetchTable(ConnectionEntity entity, String tableName, String database, int maxRows)
            throws SQLException {
        return fetchTable(entity, tableName, database, maxRows, 0);
    }

    /** Runs arbitrary SELECT and maps all rows (used by export/metadata helpers). */
    public TableDataResult fetchBySql(ConnectionEntity entity, String sql) throws SQLException {
        return connectionAccessor.withConnection(
                entity,
                null,
                connection -> queryAll(connection, sql)
        );
    }

    /** Counts rows for migration validation; optional WHERE is appended safely. */
    public long countTableRows(
            ConnectionEntity entity,
            String tableName,
            String database,
            String whereClause
    ) throws SQLException {
        return connectionAccessor.withConnection(entity, database, connection -> {
            String selectSql = buildTableSelectSql(connection, entity, tableName, database);
            String countSql = SqlTransformOps.wrapCount(selectSql);
            countSql = MigrationWhereSupport.appendWhere(countSql, whereClause);
            try (Statement statement = connection.createStatement()) {
                applyQueryTimeout(statement);
                try (ResultSet rs = statement.executeQuery(countSql)) {
                    if (rs.next()) {
                        return rs.getLong(1);
                    }
                    return 0L;
                }
            }
        });
    }

    private String buildTableSelectSql(
            Connection connection,
            ConnectionEntity entity,
            String tableName,
            String database
    ) throws SQLException {
        String dbType = DbType.normalizeId(entity.getDbType());
        if (DbType.isSqlServerFamily(dbType)) {
            return SqlTableSelectSupport.selectAllFrom(
                    SqlServerCatalogSupport.qualifyTable(connection, database, tableName),
                    dbType
            );
        }
        return buildTableSelectSql(entity, tableName, database);
    }

    /** Fetches one page using dialect LIMIT/OFFSET wrapper. */
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
        long startedAt = System.currentTimeMillis();
        ExecuteSqlResult result = connectionAccessor.withConnection(
                entity,
                database,
                connection -> executeSelectPageOnConnection(
                        connection,
                        entity.getDbType(),
                        sql,
                        pageSize,
                        offset,
                        executionKey,
                        tracker
                )
        );
        return JdbcStatementExecutor.withWallClockDuration(result, System.currentTimeMillis() - startedAt);
    }

    /** Page fetch on caller-owned connection (manual transaction sessions). */
    public ExecuteSqlResult executeSelectPageOnConnection(
            Connection connection,
            String dbType,
            String sql,
            int pageSize,
            int offset
    ) throws SQLException {
        return executeSelectPageOnConnection(connection, dbType, sql, pageSize, offset, null, null, false);
    }

    /** Migration page fetch: preserve cell types (no UI truncation / hex rewrite). */
    public ExecuteSqlResult executeSelectPageForMigrationOnConnection(
            Connection connection,
            String dbType,
            String sql,
            int pageSize,
            int offset
    ) throws SQLException {
        return executeSelectPageOnConnection(connection, dbType, sql, pageSize, offset, null, null, true);
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
        return executeSelectPageOnConnection(
                connection, dbType, sql, pageSize, offset, executionKey, tracker, false);
    }

    public ExecuteSqlResult executeSelectPageOnConnection(
            Connection connection,
            String dbType,
            String sql,
            int pageSize,
            int offset,
            String executionKey,
            SqlExecutionTracker tracker,
            boolean preserveForMigration
    ) throws SQLException {
        requireOffsetWithinLimit(offset);
        long start = System.currentTimeMillis();
        String trimmed = sql != null ? sql.trim() : "";
        String pagedSql = paginationService.applyLimitOffset(trimmed, dbType, pageSize + 1, offset);
        boolean tracked = executionKey != null && tracker != null;
        String queryId = null;
        // Statement lives in try-with-resources so a failure while applying fetch size
        // or query timeout cannot leak a pooled connection's statement.
        try (Statement statement = connection.createStatement()) {
            if (tracked) {
                queryId = tracker.register(executionKey, statement, connection);
            }
            try {
                poolProperties.applyPagedReadFetchSize(statement, pageSize);
                applyQueryTimeout(statement);
                try (ResultSet rs = statement.executeQuery(pagedSql)) {
                    TableDataResult tableData = JdbcResultSetMapper.mapPage(rs, pageSize, preserveForMigration);
                    long duration = System.currentTimeMillis() - start;
                    ExecuteSqlResult result = new ExecuteSqlResult(
                            trimmed,
                            tableData.rows().size(),
                            duration,
                            tableData.columns(),
                            tableData.rows(),
                            null,
                            null,
                            null,
                            tableData.hasMore(),
                            offset,
                            pageSize
                    );
                    return queryId != null ? result.withQueryId(queryId) : result;
                }
            } finally {
                if (tracked) {
                    tracker.unregister(executionKey, statement);
                }
            }
        }
    }

    /** Best-effort table name extraction from SQL text for logging/UI hints. */
    public String guessTableName(String sql) {
        Matcher matcher = FROM_PATTERN.matcher(sql != null ? sql : "");
        return matcher.find() ? matcher.group(1) : null;
    }

    private TableDataResult queryAll(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            poolProperties.applyFetchSize(statement);
            applyQueryTimeout(statement);
            try (ResultSet rs = statement.executeQuery(sql)) {
                return JdbcResultSetMapper.mapAll(rs);
            }
        }
    }

    private TableDataResult queryLimited(Connection connection, String sql, int maxRows) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            poolProperties.applyPagedReadFetchSize(statement, maxRows);
            applyQueryTimeout(statement);
            try (ResultSet rs = statement.executeQuery(sql)) {
                return JdbcResultSetMapper.mapPage(rs, maxRows);
            }
        }
    }

    private void applyQueryTimeout(Statement statement) throws SQLException {
        int seconds = org.apache.datawise.backend.jdbc.support.QueryTimeoutOverride.resolve(queryTimeoutSeconds);
        if (seconds > 0) {
            statement.setQueryTimeout(seconds);
        }
    }

    private void requireOffsetWithinLimit(int offset) {
        if (org.apache.datawise.backend.common.DeepOffsetGuard.isDataMovement()) {
            return;
        }
        if (maxCursorOffset > 0 && offset > maxCursorOffset) {
            throw new SqlDeepOffsetException(offset, maxCursorOffset);
        }
    }
}
