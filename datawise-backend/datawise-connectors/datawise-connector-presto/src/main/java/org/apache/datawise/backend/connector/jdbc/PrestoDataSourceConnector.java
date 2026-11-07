package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class PrestoDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public PrestoDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-presto", 24, Set.of("presto"), jdbc);
    }
}
