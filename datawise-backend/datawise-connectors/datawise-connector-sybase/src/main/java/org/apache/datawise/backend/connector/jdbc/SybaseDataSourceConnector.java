package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class SybaseDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public SybaseDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-sybase", 21, Set.of("sybase"), jdbc);
    }
}
