package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class SqlServerDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public SqlServerDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-sqlserver", 22, Set.of("sqlserver", "mssql"), jdbc);
    }
}
