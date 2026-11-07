package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class TrinoDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public TrinoDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-trino", 24, Set.of("trino"), jdbc);
    }
}
