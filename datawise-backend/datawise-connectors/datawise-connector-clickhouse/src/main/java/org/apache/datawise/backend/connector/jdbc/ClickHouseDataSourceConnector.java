package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class ClickHouseDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public ClickHouseDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-clickhouse", 21, Set.of("clickhouse"), jdbc);
    }
}
