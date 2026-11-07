package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class H2DataSourceConnector extends AbstractJdbcDataSourceConnector {

    public H2DataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-h2", 21, Set.of("h2"), jdbc);
    }
}
