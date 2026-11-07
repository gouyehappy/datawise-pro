package org.apache.datawise.backend.connector.kafka;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorMessageBrokerOperations;
import org.apache.datawise.backend.connector.operation.ConnectorMessageBrokerOperations.MessageBrokerProducerCallback;
import org.apache.datawise.backend.connector.operation.MessageBrokerProducer;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.domain.KafkaClusterInfoDto;
import org.apache.datawise.backend.domain.KafkaConsumerGroupMetricsDto;
import org.apache.datawise.backend.domain.KafkaConsumerGroupsResultDto;
import org.apache.datawise.backend.domain.KafkaMessagesResultDto;
import org.apache.datawise.backend.domain.KafkaMutationResultDto;
import org.apache.datawise.backend.domain.KafkaProduceResultDto;
import org.apache.datawise.backend.domain.KafkaTopicConfigsDto;
import org.apache.datawise.backend.domain.KafkaTopicDetailDto;
import org.apache.datawise.backend.domain.KafkaTopicsResultDto;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.kafka.KafkaConnectionSupport;
import org.apache.datawise.backend.kafka.KafkaMessageProducer;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.kafka.support.KafkaConnectionErrors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class KafkaConnectorOperations
        implements ConnectorConnectionOperations, ConnectorCatalogOperations, ConnectorMessageBrokerOperations {

    private static final Logger log = LoggerFactory.getLogger(KafkaConnectorOperations.class);

    @Override
    public ConnectionTestResult test(ConnectionEntity entity) {
        long start = System.currentTimeMillis();
        try {
            KafkaConnectionSupport.ping(entity);
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(
                    true,
                    String.format("Connected to Kafka %s in %dms", entity.getHost(), latency),
                    latency
            );
        } catch (Exception ex) {
            ExceptionLogging.warn(
                    log,
                    "Kafka connection test failed for " + entity.getHost(),
                    ex
            );
            long latency = System.currentTimeMillis() - start;
            return new ConnectionTestResult(
                    false,
                    KafkaConnectionErrors.toUserMessage(entity, ex),
                    latency
            );
        }
    }

    @Override
    public List<TreeNode> loadConnectionRoot(ConnectionEntity connection, String pattern) {
        // Topic 列表在工作台内按需加载，避免 Explorer 树在 Topic 过多时不可用（同 Redis）。
        return List.of();
    }

    @Override
    public KafkaTopicsResultDto listTopics(ConnectionEntity connection, String pattern, int limit) {
        return KafkaConnectionSupport.listTopics(connection, pattern, limit);
    }

    @Override
    public KafkaTopicDetailDto describeTopic(ConnectionEntity connection, String topic) {
        return KafkaConnectionSupport.describeTopic(connection, topic);
    }

    @Override
    public KafkaClusterInfoDto describeCluster(ConnectionEntity connection) {
        return KafkaConnectionSupport.describeCluster(connection);
    }

    @Override
    public KafkaMutationResultDto createTopic(
            ConnectionEntity connection,
            String name,
            Integer partitions,
            Short replicationFactor
    ) {
        return KafkaConnectionSupport.createTopic(connection, name, partitions, replicationFactor);
    }

    @Override
    public KafkaMutationResultDto deleteTopic(ConnectionEntity connection, String topic) {
        return KafkaConnectionSupport.deleteTopic(connection, topic);
    }

    @Override
    public KafkaMutationResultDto increasePartitions(
            ConnectionEntity connection,
            String topic,
            int partitions
    ) {
        return KafkaConnectionSupport.increasePartitions(connection, topic, partitions);
    }

    @Override
    public KafkaTopicConfigsDto describeTopicConfigs(ConnectionEntity connection, String topic) {
        return KafkaConnectionSupport.describeTopicConfigs(connection, topic);
    }

    @Override
    public KafkaMutationResultDto updateTopicConfigs(
            ConnectionEntity connection,
            String topic,
            Long retentionMs,
            Long retentionBytes
    ) {
        return KafkaConnectionSupport.updateTopicConfigs(connection, topic, retentionMs, retentionBytes);
    }

    @Override
    public KafkaMessagesResultDto consumeMessages(
            ConnectionEntity connection,
            String topic,
            Integer partition,
            Long offset,
            int limit,
            boolean fromBeginning
    ) {
        return KafkaConnectionSupport.consumeMessages(
                connection, topic, partition, offset, limit, fromBeginning
        );
    }

    @Override
    public KafkaProduceResultDto produceMessage(
            ConnectionEntity connection,
            String topic,
            String key,
            String value,
            Integer partition
    ) {
        return KafkaConnectionSupport.produceMessage(connection, topic, key, value, partition);
    }

    @Override
    public <T> T withProducer(ConnectionEntity connection, MessageBrokerProducerCallback<T> callback) {
        try (MessageBrokerProducer producer = KafkaMessageProducer.openSession(connection)) {
            return callback.apply(producer);
        }
    }

    @Override
    public KafkaConsumerGroupsResultDto listConsumerGroups(
            ConnectionEntity connection,
            String pattern,
            int limit
    ) {
        return KafkaConnectionSupport.listConsumerGroups(connection, pattern, limit);
    }

    @Override
    public KafkaConsumerGroupMetricsDto describeConsumerGroupMetrics(
            ConnectionEntity connection,
            String groupId,
            String topic
    ) {
        return KafkaConnectionSupport.describeConsumerGroupMetrics(connection, groupId, topic);
    }

    @Override
    public KafkaMutationResultDto resetConsumerGroupOffsets(
            ConnectionEntity connection,
            String groupId,
            String topic,
            String strategy
    ) {
        return KafkaConnectionSupport.resetConsumerGroupOffsets(connection, groupId, topic, strategy);
    }
}
