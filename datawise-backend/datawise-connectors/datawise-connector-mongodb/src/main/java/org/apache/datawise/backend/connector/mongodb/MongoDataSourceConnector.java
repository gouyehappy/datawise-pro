package org.apache.datawise.backend.connector.mongodb;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorDocumentOperations;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;

import java.util.EnumSet;

public class MongoDataSourceConnector implements DataSourceConnector {

    private static final EnumSet<ConnectorCapability> CAPABILITIES = EnumSet.of(
            ConnectorCapability.CONNECTION_TEST,
            ConnectorCapability.CATALOG,
            ConnectorCapability.DOCUMENT_READ
    );

    private final MongoConnectorOperations mongo;

    public MongoDataSourceConnector(MongoConnectorOperations mongo) {
        this.mongo = mongo;
    }

    @Override
    public String id() {
        return "mongodb";
    }

    @Override
    public int priority() {
        return 10;
    }

    @Override
    public boolean supports(String dbType) {
        return dbType != null && "mongodb".equalsIgnoreCase(dbType);
    }

    @Override
    public EnumSet<ConnectorCapability> capabilities() {
        return EnumSet.copyOf(CAPABILITIES);
    }

    /**
     * MongoDB explorers load database→collection from the backend catalog.
     * Do not declare virtual explorer-ui features here.
     */
    @Override
    public ConnectorExplorerUiProfileDto explorerUi() {
        return null;
    }

    @Override
    public ConnectorConnectionOperations connection() {
        return mongo;
    }

    @Override
    public ConnectorCatalogOperations catalog() {
        return mongo;
    }

    @Override
    public ConnectorDocumentOperations document() {
        return mongo;
    }
}
