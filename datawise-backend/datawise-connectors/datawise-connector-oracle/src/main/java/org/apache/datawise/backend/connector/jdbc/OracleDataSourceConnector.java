package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class OracleDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public OracleDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-oracle", 21, Set.of("oracle"), jdbc);
    }
}
