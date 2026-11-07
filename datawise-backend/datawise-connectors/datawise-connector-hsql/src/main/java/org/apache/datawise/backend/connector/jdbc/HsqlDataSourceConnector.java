package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class HsqlDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public HsqlDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-hsql", 21, Set.of("hsql", "hsqldb"), jdbc);
    }
}
