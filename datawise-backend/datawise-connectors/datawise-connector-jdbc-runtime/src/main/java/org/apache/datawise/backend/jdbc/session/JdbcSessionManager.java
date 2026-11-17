package org.apache.datawise.backend.jdbc.session;

import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.SqlSessionStatus;
import org.apache.datawise.backend.jdbc.session.JdbcManualSessionStore.ManagedSession;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.jdbc.support.SqlExecutionTracker;
import org.springframework.stereotype.Component;

import java.sql.SQLException;

/** Per-user console JDBC manual transaction sessions. */
@Component
public class JdbcSessionManager {

    private final JdbcManualSessionStore sessionStore;
    private final JdbcSessionConnectionSupport connectionSupport;
    private final JdbcTransactionExecutor transactionExecutor;

    public JdbcSessionManager(
            JdbcManualSessionStore sessionStore,
            JdbcSessionConnectionSupport connectionSupport,
            JdbcTransactionExecutor transactionExecutor
    ) {
        this.sessionStore = sessionStore;
        this.connectionSupport = connectionSupport;
        this.transactionExecutor = transactionExecutor;
    }

    public SqlSessionStatus getStatus(long userId, String sessionKey) {
        return sessionStore.getStatus(userId, sessionKey);
    }

    public SqlSessionStatus begin(long userId, String sessionKey, ConnectionEntity entity, String database)
            throws SQLException {
        return setAutocommit(userId, sessionKey, entity, database, false);
    }

    public SqlSessionStatus setAutocommit(
            long userId,
            String sessionKey,
            ConnectionEntity entity,
            String database,
            boolean autocommit
    ) throws SQLException {
        ManagedSession session = sessionStore.getOrCreate(
                userId,
                sessionKey,
                entity.getId(),
                database
        );
        session.lock.lock();
        try {
            if (autocommit) {
                // Leaving manual mode must always succeed for the UI toggle. Engines like
                // Trino+Kudu reject writes outside autocommit and leave the JDBC connection
                // in "transaction aborted / unknown txn id" — commit/setAutoCommit then fail.
                // Prefer rollback + discard the connection over failing the mode switch.
                recoverAndLeaveManual(session);
                closeSession(userId, sessionKey);
                return SqlSessionStatus.idle(entity.getId(), database);
            }

            connectionSupport.ensureConnection(session, entity, database);
            session.connection.setAutoCommit(false);
            session.autocommit = false;
            return session.toStatus();
        } finally {
            session.lock.unlock();
        }
    }

    /**
     * Best-effort clear of an open/aborted manual transaction, then mark session autocommit.
     * Never throws — caller closes/discards the JDBC connection afterward.
     */
    private static void recoverAndLeaveManual(ManagedSession session) {
        session.pending = false;
        session.autocommit = true;
        if (session.connection == null) {
            return;
        }
        try {
            if (!session.connection.getAutoCommit()) {
                try {
                    session.connection.rollback();
                } catch (SQLException ignored) {
                    // Aborted/expired txn (e.g. Trino "Unknown transaction ID") — drop connection.
                }
                try {
                    session.connection.setAutoCommit(true);
                } catch (SQLException ignored) {
                    // Connection may already be unusable; closeSession discards it.
                }
            }
        } catch (SQLException ignored) {
            // getAutoCommit can fail on a dead connection.
        }
    }

    public SqlSessionStatus commit(long userId, String sessionKey) throws SQLException {
        return transactionExecutor.commit(sessionStore.requireSession(userId, sessionKey));
    }

    public SqlSessionStatus rollback(long userId, String sessionKey) throws SQLException {
        return transactionExecutor.rollback(sessionStore.requireSession(userId, sessionKey));
    }

    public void closeSession(long userId, String sessionKey) {
        ManagedSession session = sessionStore.remove(userId, sessionKey);
        connectionSupport.closeSessionConnection(session);
    }

    public ManagedSession requireManualSession(long userId, String sessionKey) {
        return sessionStore.requireManualSession(userId, sessionKey);
    }

    public void markPending(long userId, String sessionKey) {
        sessionStore.markPending(userId, sessionKey);
    }

    /** {@code executionKey} 格式 {@code userId:sessionKey}，与控制台取消 API 一致。 */
    public void invalidateConnectionAfterAbort(String executionKey) {
        sessionStore.invalidateConnection(executionKey);
    }

    public ExecuteSqlResult executeInManualSession(
            long userId,
            String sessionKey,
            ConnectionEntity entity,
            String database,
            String sql,
            int maxRows
    ) throws SQLException {
        return executeInManualSession(userId, sessionKey, entity, database, sql, maxRows, null, null);
    }

    public ExecuteSqlResult executeInManualSession(
            long userId,
            String sessionKey,
            ConnectionEntity entity,
            String database,
            String sql,
            int maxRows,
            String executionKey,
            SqlExecutionTracker tracker
    ) throws SQLException {
        return transactionExecutor.executeInManualSession(
                sessionStore.requireManualSession(userId, sessionKey),
                entity,
                database,
                sql,
                maxRows,
                executionKey,
                tracker
        );
    }

    public ExecuteSqlResult executeSelectPageInManualSession(
            long userId,
            String sessionKey,
            ConnectionEntity entity,
            String database,
            String sql,
            int pageSize,
            int offset,
            String executionKey,
            SqlExecutionTracker tracker
    ) throws SQLException {
        return transactionExecutor.executeSelectPageInManualSession(
                sessionStore.requireManualSession(userId, sessionKey),
                entity,
                database,
                sql,
                pageSize,
                offset,
                executionKey,
                tracker
        );
    }
}
