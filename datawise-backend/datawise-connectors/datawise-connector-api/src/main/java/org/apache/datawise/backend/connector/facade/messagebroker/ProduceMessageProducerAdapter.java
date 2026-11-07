package org.apache.datawise.backend.connector.facade.messagebroker;

import org.apache.datawise.backend.connector.operation.ConnectorMessageBrokerOperations;
import org.apache.datawise.backend.connector.operation.MessageBrokerProducer;
import org.apache.datawise.backend.domain.KafkaProduceResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;

/**
 * Fallback producer that delegates each send to {@link ConnectorMessageBrokerOperations#produceMessage}.
 * Used when a connector plugin predates {@code withProducer} session support.
 */
final class ProduceMessageProducerAdapter implements MessageBrokerProducer {

    private final ConnectionEntity connection;
    private final ConnectorMessageBrokerOperations broker;

    ProduceMessageProducerAdapter(ConnectionEntity connection, ConnectorMessageBrokerOperations broker) {
        this.connection = connection;
        this.broker = broker;
    }

    @Override
    public KafkaProduceResultDto send(String topic, String key, String value, Integer partition) {
        return broker.produceMessage(connection, topic, key, value, partition);
    }

    @Override
    public void close() {
        // produceMessage opens and closes its own short-lived producer.
    }
}
