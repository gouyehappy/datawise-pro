package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class Db2DataSourceConnector extends AbstractJdbcDataSourceConnector {

    public Db2DataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-db2", 21, Set.of("db2"), jdbc);
    }
}
