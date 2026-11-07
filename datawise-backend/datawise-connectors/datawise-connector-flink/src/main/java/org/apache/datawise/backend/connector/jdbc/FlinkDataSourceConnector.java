package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class FlinkDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public FlinkDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-flink", 26, Set.of("flink"), jdbc);
    }
}
