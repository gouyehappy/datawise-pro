package org.apache.datawise.backend.connector.kudu.support;

import org.apache.datawise.backend.connector.support.ConnectorErrorSupport;
import org.apache.datawise.backend.connector.support.ConnectorErrorTemplate;
import org.apache.datawise.backend.model.ConnectionEntity;

public final class KuduConnectionErrors {

    private KuduConnectionErrors() {
    }

    public static String toUserMessage(ConnectionEntity entity, Throwable error) {
        return ConnectorErrorSupport.toUserMessage(entity, error, ConnectorErrorTemplate.kudu());
    }
}
