package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class Gbase8aDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public Gbase8aDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-gbase8a", 21, Set.of("gbase8a"), jdbc);
    }
}
