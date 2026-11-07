package org.apache.datawise.backend.connector.kudu;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorDocumentOperations;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;

import java.util.EnumSet;

public class KuduDataSourceConnector implements DataSourceConnector {

    private static final EnumSet<ConnectorCapability> CAPABILITIES = EnumSet.of(
            ConnectorCapability.CONNECTION_TEST,
            ConnectorCapability.CATALOG,
            ConnectorCapability.METADATA,
            ConnectorCapability.DOCUMENT_READ
    );

    private final KuduConnectorOperations kudu;

    public KuduDataSourceConnector(KuduConnectorOperations kudu) {
        this.kudu = kudu;
    }

    @Override
    public String id() {
        return "kudu";
    }

    @Override
    public int priority() {
        return 10;
    }

    @Override
    public boolean supports(String dbType) {
        return dbType != null && "kudu".equalsIgnoreCase(dbType);
    }

    @Override
    public EnumSet<ConnectorCapability> capabilities() {
        return EnumSet.copyOf(CAPABILITIES);
    }

    /**
     * Kudu explorers load tables from the backend catalog.
     * Do not declare virtual explorer-ui features here.
     */
    @Override
    public ConnectorExplorerUiProfileDto explorerUi() {
        return null;
    }

    @Override
    public ConnectorConnectionOperations connection() {
        return kudu;
    }

    @Override
    public ConnectorCatalogOperations catalog() {
        return kudu;
    }

    @Override
    public ConnectorDocumentOperations document() {
        return kudu;
    }
}
