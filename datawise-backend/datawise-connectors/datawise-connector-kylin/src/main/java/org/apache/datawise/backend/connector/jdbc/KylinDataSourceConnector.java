package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.Set;

public class KylinDataSourceConnector extends AbstractJdbcDataSourceConnector {

    public KylinDataSourceConnector(ConnectorJdbcOperations jdbc) {
        super("jdbc-kylin", 21, Set.of("kylin"), jdbc);
    }
}
