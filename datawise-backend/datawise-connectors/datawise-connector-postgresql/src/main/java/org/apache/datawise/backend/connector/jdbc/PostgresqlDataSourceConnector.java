package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.operation.ConnectorDdlOperations;
import org.apache.datawise.backend.connector.operation.ConnectorMetadataOperations;

import java.util.EnumSet;
import java.util.Set;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

public class PostgresqlDataSourceConnector extends AbstractJdbcDataSourceConnector {

    private final PostgresqlConnectorOperations postgresql;

    public PostgresqlDataSourceConnector(ConnectorJdbcOperations jdbc, PostgresqlConnectorOperations postgresql) {
        super("jdbc-postgresql", 21, Set.of("postgresql"), jdbc);
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
