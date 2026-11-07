package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class OscarDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public OscarDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-oscar", 21, Set.of("oscar"), jdbc);
    }
}
