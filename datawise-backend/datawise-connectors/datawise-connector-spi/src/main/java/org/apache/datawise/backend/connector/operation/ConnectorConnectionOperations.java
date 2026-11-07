package org.apache.datawise.backend.connector.operation;

import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.model.ConnectionEntity;

public interface ConnectorConnectionOperations {

    ConnectionTestResult test(ConnectionEntity entity);

    /** Lightweight reachability probe; JDBC defaults to a short pool borrow. */
    default ConnectionTestResult ping(ConnectionEntity entity) {
        return test(entity);
    }
}
