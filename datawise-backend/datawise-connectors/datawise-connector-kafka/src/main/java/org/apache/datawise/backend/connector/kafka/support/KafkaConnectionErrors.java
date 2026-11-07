package org.apache.datawise.backend.connector.kafka.support;

import org.apache.datawise.backend.common.support.ThrowableSupport;
import org.apache.datawise.backend.connector.support.ConnectorErrorSupport;
import org.apache.datawise.backend.connector.support.ConnectorErrorTemplate;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.Locale;

/** Maps Kafka client errors to user-facing messages. */
public final class KafkaConnectionErrors {

    private KafkaConnectionErrors() {
    }

    public static String toUserMessage(ConnectionEntity entity, Throwable error) {
        String root = ThrowableSupport.rootMessage(error);
        if (root != null) {
            String lower = root.toLowerCase(Locale.ROOT);
            if (lower.contains("unknown topic") || lower.contains("topic authorization failed")) {
                return "Kafka topic operation failed. Check topic name and ACL permissions.";
            }
        }
        return ConnectorErrorSupport.toUserMessage(entity, error, ConnectorErrorTemplate.kafka());
    }
}
