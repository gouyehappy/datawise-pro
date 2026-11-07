package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class CachedbDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public CachedbDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-cachedb", 21, Set.of("cachedb"), jdbc);
    }
}
