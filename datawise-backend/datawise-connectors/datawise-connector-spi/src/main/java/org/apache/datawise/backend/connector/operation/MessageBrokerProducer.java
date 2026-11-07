package org.apache.datawise.backend.connector.operation;

import org.apache.datawise.backend.domain.KafkaProduceResultDto;

/** Reusable Kafka producer for multiple sends within one session. */
public interface MessageBrokerProducer extends AutoCloseable {

    KafkaProduceResultDto send(String topic, String key, String value, Integer partition);

    @Override
    void close();
}
