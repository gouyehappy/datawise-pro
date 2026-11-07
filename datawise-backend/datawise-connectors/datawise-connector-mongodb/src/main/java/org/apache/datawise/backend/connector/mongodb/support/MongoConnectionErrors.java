package org.apache.datawise.backend.connector.mongodb.support;

import org.apache.datawise.backend.connector.support.ConnectorErrorSupport;
import org.apache.datawise.backend.connector.support.ConnectorErrorTemplate;
import org.apache.datawise.backend.model.ConnectionEntity;

/** Maps MongoDB driver exceptions to user-facing messages. */
public final class MongoConnectionErrors {

    private MongoConnectionErrors() {
    }

    public static String toUserMessage(ConnectionEntity entity, Throwable error) {
        return ConnectorErrorSupport.toUserMessage(entity, error, ConnectorErrorTemplate.mongodb());
    }
}
