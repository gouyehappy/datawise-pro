package org.apache.datawise.backend.common;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConnectionCapabilityMatrixTest {

    @Test
    void mysqlSupportsDiagramButNotTransactionalDdl() {
        ConnectionCapabilityMatrix matrix = ConnectionCapabilityMatrix.get();
        assertTrue(matrix.supports("mysql", "diagram"));
        assertTrue(matrix.supports("mysql", "visualQueryBuilder"));
        assertFalse(matrix.transactionalDdl("mysql"));
        assertFalse(matrix.specializedSurface("mysql"));
    }

    @Test
    void postgresqlSupportsTransactionalDdl() {
        assertTrue(ConnectionCapabilityMatrix.get().transactionalDdl("postgresql"));
        assertTrue(ConnectionCapabilityMatrix.get().supports("opengauss", "transactionalDdl"));
    }

    @Test
    void redisIsSpecializedWithoutSqlWorkbenchFeatures() {
        ConnectionCapabilityMatrix matrix = ConnectionCapabilityMatrix.get();
        assertTrue(matrix.specializedSurface("redis"));
        assertFalse(matrix.supports("redis", "diagram"));
        assertFalse(matrix.supports("redis", "visualQueryBuilder"));
        assertFalse(matrix.supports("redis", "queryExecution"));
    }

    @Test
    void unknownTypeIsConservative() {
        assertFalse(ConnectionCapabilityMatrix.get().supports("totally-unknown-engine", "diagram"));
    }
}
