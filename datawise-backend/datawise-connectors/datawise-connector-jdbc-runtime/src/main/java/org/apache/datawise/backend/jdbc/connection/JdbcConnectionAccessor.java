package org.apache.datawise.backend.jdbc.connection;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.jdbc.support.DatabaseScopeSwitcher;
import org.apache.datawise.backend.jdbc.support.JdbcConnectionCallback;
import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.jdbc.support.JdbcDriverConnectionFactory;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.SQLException;

/**
 * JDBC connection lifecycle: borrow from pool, switch catalog/schema, transient retry and close.
 */
@Component
public class JdbcConnectionAccessor {

    private final JdbcDriverConnectionFactory connectionFactory;
    private final ConnectionActivityRegistry activityRegistry;

    public JdbcConnectionAccessor(
            JdbcDriverConnectionFactory connectionFactory,
            ConnectionActivityRegistry activityRegistry
    ) {
        this.connectionFactory = connectionFactory;
        this.activityRegistry = activityRegistry;
    }

    /** Opens a pooled JDBC connection without switching catalog/schema. */
    public Connection openConnection(ConnectionEntity entity) throws SQLException {
        activityRegistry.touch(entity.getId());
        return connectionFactory.open(entity);
    }

    /** Drops cached pool for one connection id (after config change or hard failure). */
    public void evictPool(String connectionId) {
        connectionFactory.evictPool(connectionId);
    }

    /**
     * Opens a connection and switches to the requested database/catalog.
     * Retries once after pool eviction on transient failures.
     */
    public Connection openPreparedConnection(ConnectionEntity entity, String database) throws SQLException {
        return withTransientRetry(entity, () -> {
            Connection connection = openConnection(entity);
            applyCatalog(connection, entity.getDbType(), database);
            return connection;
        });
    }

    /**
     * Runs a callback on a short-lived connection with catalog switch and automatic close.
     */
    public <T> T withConnection(
            ConnectionEntity entity,
            String database,
            JdbcConnectionCallback<T> callback
    ) throws SQLException {
        return withTransientRetry(entity, () -> runWithConnection(entity, database, callback));
    }

    /** Quick health check used by connection test flow; does not warm or touch pooled connections. */
    public boolean canConnect(ConnectionEntity entity) throws SQLException {
        try (Connection connection = connectionFactory.openDirect(entity)) {
            return connection.isValid(3);
        }
    }

    /** Switches PostgreSQL schema, catalog.schema instance key, or JDBC catalog. */
    public void applyCatalog(Connection connection, String dbType, String database) throws SQLException {
        DatabaseScopeSwitcher.apply(connection, dbType, database);
    }

    static boolean catalogAlreadyApplied(Connection connection, String normalizedDbType, String database)
            throws SQLException {
        return DatabaseScopeSwitcher.isAlreadyApplied(connection, normalizedDbType, database);
    }

    private <T> T runWithConnection(
            ConnectionEntity entity,
            String database,
            JdbcConnectionCallback<T> callback
    ) throws SQLException {
        try (Connection connection = openConnection(entity)) {
            applyCatalog(connection, entity.getDbType(), database);
            return callback.apply(connection);
        }
    }

    private <T> T withTransientRetry(
            ConnectionEntity entity,
            SqlSupplier<T> action
    ) throws SQLException {
        try {
            return action.get();
        } catch (SQLException ex) {
            if (!JdbcConnectionErrors.isTransientConnectionFailure(ex)) {
                throw new SQLException(JdbcConnectionErrors.toUserMessage(entity, ex), ex);
            }
            connectionFactory.evictPool(entity.getId());
            try {
                return action.get();
            } catch (SQLException retryEx) {
                throw new SQLException(JdbcConnectionErrors.toUserMessage(entity, retryEx), retryEx);
            }
        }
    }

    @FunctionalInterface
    private interface SqlSupplier<T> {
        T get() throws SQLException;
    }
}
