package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class DorisDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public DorisDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-doris", 23, Set.of("doris"), jdbc);
    }
}
