package org.apache.datawise.backend.connector.facade.jdbc;

import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.SqlSessionStatus;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.jdbc.session.JdbcManualSessionStore.ManagedSession;
import org.apache.datawise.backend.jdbc.session.JdbcSessionManager;
import org.apache.datawise.backend.jdbc.support.SqlExecutionTracker;
import org.springframework.stereotype.Component;

import java.sql.SQLException;

/** JDBC 手动会话与 SQL 执行取消入口。 */
@Component
public class ConnectorJdbcSessionAccess {

    private final JdbcSessionManager sessionManager;
    private final SqlExecutionTracker executionTracker;

    public ConnectorJdbcSessionAccess(JdbcSessionManager sessionManager, SqlExecutionTracker executionTracker) {
        this.sessionManager = sessionManager;
        this.executionTracker = executionTracker;
    }

    public SqlSessionStatus getStatus(long userId, String sessionKey) {
        return sessionManager.getStatus(userId, sessionKey);
    }

    public SqlSessionStatus begin(long userId, String sessionKey, ConnectionEntity entity, String database) throws SQLException {
        return sessionManager.begin(userId, sessionKey, entity, database);
    }

    public SqlSessionStatus setAutocommit(
                                          long userId,
                                          String sessionKey,
                                          ConnectionEntity entity,
                                          String database,
                                          boolean autocommit) throws SQLException {
        return sessionManager.setAutocommit(userId, sessionKey, entity, database, autocommit);
    }

    public SqlSessionStatus commit(long userId, String sessionKey) throws SQLException {
        return sessionManager.commit(userId, sessionKey);
    }

    public SqlSessionStatus rollback(long userId, String sessionKey) throws SQLException {
        return sessionManager.rollback(userId, sessionKey);
    }

    public void closeSession(long userId, String sessionKey) {
        sessionManager.closeSession(userId, sessionKey);
    }

    public ManagedSession requireManualSession(long userId, String sessionKey) {
        return sessionManager.requireManualSession(userId, sessionKey);
    }

    public ExecuteSqlResult executeInManualSession(
                                                   long userId,
                                                   String sessionKey,
                                                   ConnectionEntity entity,
                                                   String database,
                                                   String sql,
                                                   int maxRows,
                                                   String executionKey) throws SQLException {
        return sessionManager.executeInManualSession(
                userId,
                sessionKey,
                entity,
                database,
                sql,
                maxRows,
                executionKey,
                executionTracker);
    }

    public ExecuteSqlResult executeSelectPageInManualSession(
                                                             long userId,
                                                             String sessionKey,
                                                             ConnectionEntity entity,
                                                             String database,
                                                             String sql,
                                                             int pageSize,
                                                             int offset,
                                                             String executionKey) throws SQLException {
        return sessionManager.executeSelectPageInManualSession(
                userId,
                sessionKey,
                entity,
                database,
                sql,
                pageSize,
                offset,
                executionKey,
                executionTracker);
    }

    public SqlExecutionTracker.CancelOutcome cancelQuery(String executionKey) {
        return executionTracker.cancelQuery(executionKey);
    }

    public SqlExecutionTracker.CancelOutcome cancelConnection(String executionKey) {
        SqlExecutionTracker.CancelOutcome outcome = executionTracker.cancelConnection(executionKey);
        if (outcome.cancelled()) {
            sessionManager.invalidateConnectionAfterAbort(executionKey);
        }
        return outcome;
    }

    public boolean hasRunningQuery(String queryIdOrExecutionKey) {
        return executionTracker.hasRunningQuery(queryIdOrExecutionKey)
                || executionTracker.hasRunningExecution(queryIdOrExecutionKey);
    }

    public SqlExecutionTracker.RunningExecution peekRunning(String queryIdOrExecutionKey) {
        return executionTracker.peek(queryIdOrExecutionKey);
    }

    SqlExecutionTracker executionTracker() {
        return executionTracker;
    }
}
