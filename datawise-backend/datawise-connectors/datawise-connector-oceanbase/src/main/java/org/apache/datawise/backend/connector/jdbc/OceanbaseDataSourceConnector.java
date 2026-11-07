package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class OceanbaseDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public OceanbaseDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-oceanbase", 20, Set.of("oceanbase"), jdbc);
    }
}
