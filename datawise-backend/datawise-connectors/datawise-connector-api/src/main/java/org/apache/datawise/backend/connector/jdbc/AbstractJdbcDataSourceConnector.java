package org.apache.datawise.backend.connector.jdbc;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorDdlOperations;
import org.apache.datawise.backend.connector.operation.ConnectorMetadataOperations;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;

import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;

public abstract class AbstractJdbcDataSourceConnector implements DataSourceConnector {

    private static final EnumSet<ConnectorCapability> JDBC_CAPABILITIES = EnumSet.of(
            ConnectorCapability.CONNECTION_TEST,
            ConnectorCapability.CATALOG,
            ConnectorCapability.METADATA,
            ConnectorCapability.DDL_READ,
            ConnectorCapability.SQL_EXECUTE,
            ConnectorCapability.SQL_EXPLAIN,
            ConnectorCapability.DML,
            ConnectorCapability.SSH_TUNNEL);

    private final String connectorId;
    private final int priority;
    private final Set<String> supportedDbTypes;
    private final ConnectorJdbcOperations jdbc;

    protected AbstractJdbcDataSourceConnector(String connectorId, Set<String> supportedDbTypes, ConnectorJdbcOperations jdbc) {
        this(connectorId, 500, supportedDbTypes, jdbc);
    }

    protected AbstractJdbcDataSourceConnector(
                                              String connectorId,
                                              int priority,
                                              Set<String> supportedDbTypes,
                                              ConnectorJdbcOperations jdbc) {
        this.connectorId = connectorId;
        this.priority = priority;
        this.supportedDbTypes = supportedDbTypes;
        this.jdbc = jdbc;
    }

    @Override
    public int priority() {
        return priority;
    }

    @Override
    public String id() {
        return connectorId;
    }

    @Override
    public boolean supports(String dbType) {
        if (dbType == null || dbType.isBlank()) {
            return false;
        }
        return supportedDbTypes.contains(dbType.toLowerCase(Locale.ROOT));
    }

    @Override
    public EnumSet<ConnectorCapability> capabilities() {
        return EnumSet.copyOf(JDBC_CAPABILITIES);
    }

    /**
     * JDBC explorers load catalog→schema→table from the backend.
     * Never declare virtual feature children here — especially three-tier
     * engines (Trino / Presto / SQL Server) where connection children are catalogs.
     */
    @Override
    public ConnectorExplorerUiProfileDto explorerUi() {
        return null;
    }

    @Override
    public ConnectorConnectionOperations connection() {
        return jdbc;
    }

    @Override
    public ConnectorCatalogOperations catalog() {
        return jdbc;
    }

    @Override
    public ConnectorMetadataOperations metadata() {
        return jdbc;
    }

    @Override
    public ConnectorDdlOperations ddl() {
        return jdbc;
    }
}
