package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class TdengineDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public TdengineDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-tdengine", 21, Set.of("tdengine"), jdbc);
    }
}
