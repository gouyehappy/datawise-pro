package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.SQLException;

@Component
public class JdbcDriverConnectionFactory {

    private final JdbcConnectionPoolManager connectionPoolManager;

    public JdbcDriverConnectionFactory(JdbcConnectionPoolManager connectionPoolManager) {
        this.connectionPoolManager = connectionPoolManager;
    }

    public Connection open(ConnectionEntity entity) throws SQLException {
        if ("redis".equalsIgnoreCase(entity.getDbType())) {
            throw new SQLException("Redis connections do not use JDBC");
        }
        return connectionPoolManager.open(entity);
    }

    public void evictPool(String connectionId) {
        connectionPoolManager.evict(connectionId);
    }

    public Connection openDirect(ConnectionEntity entity) throws SQLException {
        return connectionPoolManager.openDirect(entity);
    }
}
