package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class MysqlDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public MysqlDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-mysql", 20, Set.of("mysql", "mariadb"), jdbc);
    }
}
