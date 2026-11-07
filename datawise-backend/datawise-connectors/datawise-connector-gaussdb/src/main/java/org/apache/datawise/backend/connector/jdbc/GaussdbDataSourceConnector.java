package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.operation.ConnectorDdlOperations;
import org.apache.datawise.backend.connector.operation.ConnectorMetadataOperations;
import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

import java.util.EnumSet;
import java.util.Set;

public class GaussdbDataSourceConnector extends AbstractJdbcDataSourceConnector {

    private final PostgresqlConnectorOperations postgresql;

    public GaussdbDataSourceConnector(ConnectorJdbcOperations jdbc, PostgresqlConnectorOperations postgresql) {
        super("jdbc-gaussdb", 21, Set.of("gaussdb"), jdbc);
        this.postgresql = postgresql;
    }

    @Override
    public EnumSet<ConnectorCapability> capabilities() {
        EnumSet<ConnectorCapability> caps = EnumSet.copyOf(super.capabilities());
        caps.add(ConnectorCapability.DDL_RENDER);
        return caps;
    }

    @Override
    public ConnectorMetadataOperations metadata() {
        return postgresql;
    }

    @Override
    public ConnectorDdlOperations ddl() {
        return postgresql;
    }
}
