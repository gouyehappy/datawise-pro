package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class HiveDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public HiveDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-hive", 13, Set.of("hive"), jdbc);
    }
}
