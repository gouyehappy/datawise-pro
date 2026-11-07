package org.apache.datawise.backend.connector.jdbc;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(MockitoExtension.class)
class StarRocksDataSourceConnectorTest {

    @Mock
    private JdbcConnectorOperations jdbcConnectorOperations;

    @Test
    void supportsOnlyStarRocksDbType() {
        StarRocksDataSourceConnector connector = new StarRocksDataSourceConnector(jdbcConnectorOperations);
        assertEquals("jdbc-starrocks", connector.id());
        assertTrue(connector.supports("starrocks"));
        assertTrue(connector.supports("STARROCKS"));
        assertFalse(connector.supports("doris"));
    }
}
