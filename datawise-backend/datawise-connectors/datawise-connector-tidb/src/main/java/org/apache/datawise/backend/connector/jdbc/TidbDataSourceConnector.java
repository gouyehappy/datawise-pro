package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class TidbDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public TidbDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-tidb", 21, Set.of("tidb"), jdbc);
    }
}
