package org.apache.datawise.backend.connector;

public class UnsupportedConnectorOperationException extends UnsupportedOperationException {

    public UnsupportedConnectorOperationException(String connectorId, String operation) {
        super("Connector " + connectorId + " does not support operation: " + operation);
    }
}
