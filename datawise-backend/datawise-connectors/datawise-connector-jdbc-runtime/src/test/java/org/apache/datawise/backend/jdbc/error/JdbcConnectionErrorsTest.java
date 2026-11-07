package org.apache.datawise.backend.jdbc.error;

import org.apache.datawise.backend.common.DatabaseServiceException;
import org.junit.jupiter.api.Test;

import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcConnectionErrorsTest {

    @Test
    void toUserMessage_mapsNoSuitableDriver() {
        Exception error = new Exception("No suitable driver found for jdbc:mysql://localhost:3306/db");
        String message = JdbcConnectionErrors.toUserMessage(error);
        assertTrue(message.contains("Maven"));
        assertTrue(JdbcConnectionErrors.isDriverRelated(error));
    }

    @Test
    void toUserMessage_mapsPostgresqlIoError() {
        var entity = new org.apache.datawise.backend.model.ConnectionEntity();
        entity.setName("docker-pgsql");
        entity.setHost("127.0.0.1");
        entity.setPort("5432");
        entity.setDbType("postgresql");
        Exception error = new Exception("An I/O error occurred while sending to the backend.");
        String message = JdbcConnectionErrors.toUserMessage(entity, error);
        assertTrue(message.contains("PostgreSQL"));
        assertTrue(message.contains("schema"));
        assertTrue(JdbcConnectionErrors.isTransientConnectionFailure(error));
    }

    @Test
    void toUserMessage_mapsHikariPoolTimeout() {
        var entity = new org.apache.datawise.backend.model.ConnectionEntity();
        entity.setName("docker-mysql");
        entity.setHost("192.0.2.76");
        entity.setPort("3306");
        entity.setDbType("mysql");
        Exception error = new Exception(
                "dw-new-1782091156022 - Connection is not available, request timed out after 10012ms "
                        + "(total=0, active=0, idle=0, waiting=0)"
        );
        String message = JdbcConnectionErrors.toUserMessage(entity, error);
        assertTrue(message.contains("timed out"));
        assertTrue(JdbcConnectionErrors.isTransientConnectionFailure(error));
    }

    @Test
    void toServiceException_returnsDatabaseServiceExceptionWithErrorCode() {
        SQLException ex = new SQLException("No suitable driver found for jdbc:mysql://localhost/db");
        DatabaseServiceException serviceEx = JdbcConnectionErrors.toServiceException(ex);
        assertEquals(JdbcConnectionErrors.ERROR_CODE_JDBC_DRIVER_LOAD, serviceEx.getErrorCode());
        assertTrue(serviceEx.getMessage().contains("Maven"));
    }
}
