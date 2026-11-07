package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class PhoenixDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public PhoenixDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-phoenix", 21, Set.of("phoenix"), jdbc);
    }
}
