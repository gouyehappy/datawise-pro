package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class SqliteDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public SqliteDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-sqlite", 21, Set.of("sqlite", "sqlite3"), jdbc);
    }
}
