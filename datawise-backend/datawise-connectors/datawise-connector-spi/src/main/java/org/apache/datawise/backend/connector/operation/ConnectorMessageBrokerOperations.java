package org.apache.datawise.backend.connector.operation;

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

public interface ConnectorMessageBrokerOperations {

    KafkaTopicsResultDto listTopics(ConnectionEntity connection, String pattern, int limit);

    KafkaTopicDetailDto describeTopic(ConnectionEntity connection, String topic);

    KafkaMessagesResultDto consumeMessages(
                                           ConnectionEntity connection,
                                           String topic,
                                           Integer partition,
                                           Long offset,
                                           int limit,
                                           boolean fromBeginning);

    KafkaProduceResultDto produceMessage(
                                         ConnectionEntity connection,
                                         String topic,
                                         String key,
                                         String value,
                                         Integer partition);

    KafkaConsumerGroupsResultDto listConsumerGroups(ConnectionEntity connection, String pattern, int limit);

    KafkaConsumerGroupMetricsDto describeConsumerGroupMetrics(
                                                              ConnectionEntity connection,
                                                              String groupId,
                                                              String topic);

    default KafkaClusterInfoDto describeCluster(ConnectionEntity connection) {
        throw new UnsupportedOperationException("Cluster info is not supported for this connection type");
    }

    default KafkaMutationResultDto createTopic(
                                               ConnectionEntity connection,
                                               String name,
                                               Integer partitions,
                                               Short replicationFactor) {
        throw new UnsupportedOperationException("Create topic is not supported for this connection type");
    }

    default KafkaMutationResultDto deleteTopic(ConnectionEntity connection, String topic) {
        throw new UnsupportedOperationException("Delete topic is not supported for this connection type");
    }

    default KafkaMutationResultDto increasePartitions(
                                                      ConnectionEntity connection,
                                                      String topic,
                                                      int partitions) {
        throw new UnsupportedOperationException("Increase partitions is not supported for this connection type");
    }

    default KafkaTopicConfigsDto describeTopicConfigs(ConnectionEntity connection, String topic) {
        throw new UnsupportedOperationException("Topic configs are not supported for this connection type");
    }

    default KafkaMutationResultDto updateTopicConfigs(
                                                      ConnectionEntity connection,
                                                      String topic,
                                                      Long retentionMs,
                                                      Long retentionBytes) {
        throw new UnsupportedOperationException("Update topic configs is not supported for this connection type");
    }

    default KafkaMutationResultDto resetConsumerGroupOffsets(
                                                             ConnectionEntity connection,
                                                             String groupId,
                                                             String topic,
                                                             String strategy) {
        throw new UnsupportedOperationException("Reset offsets is not supported for this connection type");
    }

    /**
     * Opens a producer session, runs the callback, then closes the producer (flush included).
     */
    default <T> T withProducer(ConnectionEntity connection, MessageBrokerProducerCallback<T> callback) {
        throw new UnsupportedOperationException("Producer session is not supported for this connection type");
    }

    @FunctionalInterface
    interface MessageBrokerProducerCallback<T> {

        T apply(MessageBrokerProducer producer);
    }
}
