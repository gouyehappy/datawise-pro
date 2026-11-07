package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class StarRocksDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public StarRocksDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-starrocks", 22, Set.of("starrocks"), jdbc);
    }
}
