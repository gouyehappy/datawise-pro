package org.apache.datawise.backend.jdbc.session;

import org.apache.datawise.backend.jdbc.session.JdbcManualSessionStore.ManagedSession;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.jdbc.execution.JdbcQueryExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Objects;

/** JDBC 手动会话连接绑定与生命周期。 */
@Component
public class JdbcSessionConnectionSupport {

    private static final Logger log = LoggerFactory.getLogger(JdbcSessionConnectionSupport.class);

    private final JdbcQueryExecutor jdbcQueryExecutor;

    public JdbcSessionConnectionSupport(JdbcQueryExecutor jdbcQueryExecutor) {
        this.jdbcQueryExecutor = jdbcQueryExecutor;
    }

    public void ensureConnection(ManagedSession session, ConnectionEntity entity, String database) throws SQLException {
        if (session.connection != null && isAlive(session.connection)) {
            if (!Objects.equals(session.connectionId, entity.getId()) || !Objects.equals(session.database, database)) {
                closeQuietly(session.connection);
                session.connection = null;
            } else {
                jdbcQueryExecutor.applyCatalog(session.connection, entity.getDbType(), database);
                return;
            }
        }
        session.connection = jdbcQueryExecutor.openPreparedConnection(entity, database);
        session.connectionId = entity.getId();
        session.database = database;
        session.autocommit = session.autocommit && session.connection.getAutoCommit();
        session.connection.setAutoCommit(session.autocommit);
    }

    public void closeSessionConnection(ManagedSession session) {
        if (session == null) {
            return;
        }
        session.lock.lock();
        try {
            closeQuietly(session.connection);
            session.connection = null;
        } finally {
            session.lock.unlock();
        }
    }

    private boolean isAlive(Connection connection) {
        try {
            return connection != null && !connection.isClosed() && connection.isValid(2);
        } catch (SQLException ex) {
            ExceptionLogging.recoverable(log, "JDBC session validity check failed", ex);
            return false;
        }
    }

    private void closeQuietly(Connection connection) {
        if (connection == null) {
            return;
        }
        try {
            if (!connection.getAutoCommit()) {
                connection.rollback();
            }
        } catch (SQLException ex) {
            ExceptionLogging.recoverable(log, "JDBC session rollback on close failed", ex);
        }
        try {
            connection.close();
        } catch (SQLException ex) {
            ExceptionLogging.recoverable(log, "JDBC session close failed", ex);
        }
    }
}
