package org.apache.datawise.backend.jdbc.session;

import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.SqlSessionStatus;
import org.apache.datawise.backend.jdbc.session.JdbcManualSessionStore.ManagedSession;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.jdbc.execution.JdbcQueryExecutor;
import org.apache.datawise.backend.jdbc.support.SqlExecutionTracker;
import org.springframework.stereotype.Component;

import java.sql.SQLException;

/** 手动 JDBC 会话内的事务提交、回滚与 SQL 执行。 */
@Component
public class JdbcTransactionExecutor {

    private final JdbcQueryExecutor jdbcQueryExecutor;
    private final JdbcSessionConnectionSupport connectionSupport;

    public JdbcTransactionExecutor(
            JdbcQueryExecutor jdbcQueryExecutor,
            JdbcSessionConnectionSupport connectionSupport
    ) {
        this.jdbcQueryExecutor = jdbcQueryExecutor;
        this.connectionSupport = connectionSupport;
    }

    public SqlSessionStatus commit(ManagedSession session) throws SQLException {
        session.lock.lock();
        try {
            session.connection.commit();
            session.pending = false;
            return session.toStatus();
        } finally {
            session.lock.unlock();
        }
    }

    public SqlSessionStatus rollback(ManagedSession session) throws SQLException {
        session.lock.lock();
        try {
            session.connection.rollback();
            session.pending = false;
            return session.toStatus();
        } finally {
            session.lock.unlock();
        }
    }

    public ExecuteSqlResult executeInManualSession(
            ManagedSession session,
            ConnectionEntity entity,
            String database,
            String sql,
            int maxRows,
            String executionKey,
            SqlExecutionTracker tracker
    ) throws SQLException {
        if (session == null) {
            return null;
        }
        session.lock.lock();
        try {
            connectionSupport.ensureConnection(session, entity, database);
            ExecuteSqlResult result = jdbcQueryExecutor.executeOnConnection(
                    session.connection,
                    sql,
                    maxRows,
                    executionKey,
                    tracker
            );
            session.pending = true;
            return result;
        } finally {
            session.lock.unlock();
        }
    }

    /**
     * Paged SELECT on the held manual-transaction connection (SQL LIMIT/OFFSET),
     * so uncommitted TX data stays visible and large tables are not fully scanned.
     */
    public ExecuteSqlResult executeSelectPageInManualSession(
            ManagedSession session,
            ConnectionEntity entity,
            String database,
            String sql,
            int pageSize,
            int offset,
            String executionKey,
            SqlExecutionTracker tracker
    ) throws SQLException {
        if (session == null) {
            return null;
        }
        session.lock.lock();
        try {
            connectionSupport.ensureConnection(session, entity, database);
            ExecuteSqlResult result = jdbcQueryExecutor.executeSelectPageOnConnection(
                    session.connection,
                    entity.getDbType(),
                    sql,
                    pageSize,
                    offset,
                    executionKey,
                    tracker
            );
            session.pending = true;
            return result;
        } finally {
            session.lock.unlock();
        }
    }
}
