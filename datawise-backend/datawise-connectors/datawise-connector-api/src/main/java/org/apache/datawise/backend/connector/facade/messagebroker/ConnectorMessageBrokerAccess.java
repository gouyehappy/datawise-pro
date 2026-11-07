package org.apache.datawise.backend.connector.facade.messagebroker;

import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.connector.operation.ConnectorMessageBrokerOperations;
import org.apache.datawise.backend.connector.operation.ConnectorMessageBrokerOperations.MessageBrokerProducerCallback;
import org.apache.datawise.backend.connector.operation.MessageBrokerProducer;
import org.apache.datawise.backend.domain.KafkaClusterInfoDto;
import org.apache.datawise.backend.domain.KafkaConsumerGroupMetricsDto;
import org.apache.datawise.backend.domain.KafkaConsumerGroupsResultDto;
import org.apache.datawise.backend.domain.KafkaMessagesResultDto;
import org.apache.datawise.backend.domain.KafkaMutationResultDto;
import org.apache.datawise.backend.domain.KafkaProduceResultDto;
import org.apache.datawise.backend.domain.KafkaTopicConfigsDto;
import org.apache.datawise.backend.domain.KafkaTopicDetailDto;
import org.apache.datawise.backend.domain.KafkaTopicsResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

/** Kafka 等消息队列能力入口。 */
@Component
public class ConnectorMessageBrokerAccess {

    private final ConnectorCatalogAccess catalog;

    public ConnectorMessageBrokerAccess(ConnectorCatalogAccess catalog) {
        this.catalog = catalog;
    }

    public KafkaTopicsResultDto listTopics(ConnectionEntity connection, String pattern, int limit) {
        return catalog.resolve(connection).messageBroker().listTopics(connection, pattern, limit);
    }

    public KafkaTopicDetailDto describeTopic(ConnectionEntity connection, String topic) {
        return catalog.resolve(connection).messageBroker().describeTopic(connection, topic);
    }

    public KafkaClusterInfoDto describeCluster(ConnectionEntity connection) {
        return catalog.resolve(connection).messageBroker().describeCluster(connection);
    }

    public KafkaMutationResultDto createTopic(
                                              ConnectionEntity connection,
                                              String name,
                                              Integer partitions,
                                              Short replicationFactor) {
        return catalog.resolve(connection).messageBroker().createTopic(
                connection, name, partitions, replicationFactor);
    }

    public KafkaMutationResultDto deleteTopic(ConnectionEntity connection, String topic) {
        return catalog.resolve(connection).messageBroker().deleteTopic(connection, topic);
    }

    public KafkaMutationResultDto increasePartitions(
                                                     ConnectionEntity connection,
                                                     String topic,
                                                     int partitions) {
        return catalog.resolve(connection).messageBroker().increasePartitions(connection, topic, partitions);
    }

    public KafkaTopicConfigsDto describeTopicConfigs(ConnectionEntity connection, String topic) {
        return catalog.resolve(connection).messageBroker().describeTopicConfigs(connection, topic);
    }

    public KafkaMutationResultDto updateTopicConfigs(
                                                     ConnectionEntity connection,
                                                     String topic,
                                                     Long retentionMs,
                                                     Long retentionBytes) {
        return catalog.resolve(connection).messageBroker().updateTopicConfigs(
                connection, topic, retentionMs, retentionBytes);
    }

    public KafkaMessagesResultDto consumeMessages(
                                                  ConnectionEntity connection,
                                                  String topic,
                                                  Integer partition,
                                                  Long offset,
                                                  int limit,
                                                  boolean fromBeginning) {
        return catalog.resolve(connection).messageBroker().consumeMessages(
                connection, topic, partition, offset, limit, fromBeginning);
    }

    public KafkaProduceResultDto produceMessage(
                                                ConnectionEntity connection,
                                                String topic,
                                                String key,
                                                String value,
                                                Integer partition) {
        return catalog.resolve(connection).messageBroker().produceMessage(
                connection, topic, key, value, partition);
    }

    public <T> T withProducer(ConnectionEntity connection, MessageBrokerProducerCallback<T> callback) {
        ConnectorMessageBrokerOperations broker = catalog.resolve(connection).messageBroker();
        try {
            return broker.withProducer(connection, callback);
        } catch (UnsupportedOperationException ex) {
            if (!isMissingProducerSession(ex)) {
                throw ex;
            }
            try (MessageBrokerProducer producer = new ProduceMessageProducerAdapter(connection, broker)) {
                return callback.apply(producer);
            }
        }
    }

    private static boolean isMissingProducerSession(UnsupportedOperationException ex) {
        String message = ex.getMessage();
        return message != null && message.contains("Producer session is not supported");
    }

    public KafkaConsumerGroupsResultDto listConsumerGroups(
                                                           ConnectionEntity connection,
                                                           String pattern,
                                                           int limit) {
        return catalog.resolve(connection).messageBroker().listConsumerGroups(connection, pattern, limit);
    }

    public KafkaConsumerGroupMetricsDto describeConsumerGroupMetrics(
                                                                     ConnectionEntity connection,
                                                                     String groupId,
                                                                     String topic) {
        return catalog.resolve(connection).messageBroker().describeConsumerGroupMetrics(connection, groupId, topic);
    }

    public KafkaMutationResultDto resetConsumerGroupOffsets(
                                                            ConnectionEntity connection,
                                                            String groupId,
                                                            String topic,
                                                            String strategy) {
        return catalog.resolve(connection).messageBroker().resetConsumerGroupOffsets(
                connection, groupId, topic, strategy);
    }
}
