package org.apache.datawise.backend.connector.jdbc;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(MockitoExtension.class)
class DorisDataSourceConnectorTest {

    @Mock
    private JdbcConnectorOperations jdbcConnectorOperations;

    @Test
    void supportsOnlyDorisDbType() {
        DorisDataSourceConnector connector = new DorisDataSourceConnector(jdbcConnectorOperations);
        assertEquals("jdbc-doris", connector.id());
        assertTrue(connector.supports("doris"));
        assertTrue(connector.supports("DORIS"));
        assertFalse(connector.supports("starrocks"));
    }
}
