package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class DmDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public DmDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-dm", 21, Set.of("dm", "dameng"), jdbc);
    }
}
