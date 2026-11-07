package org.apache.datawise.backend.kafka;

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

import java.util.List;

public final class KafkaConnectionSupport {

    private KafkaConnectionSupport() {
    }

    public static void ping(ConnectionEntity entity) throws Exception {
        KafkaTopicAdmin.ping(entity);
    }

    public static KafkaClusterInfoDto describeCluster(ConnectionEntity entity) {
        return KafkaTopicAdmin.describeCluster(entity);
    }

    public static KafkaTopicsResultDto listTopics(ConnectionEntity entity, String pattern, int limit) {
        return KafkaTopicAdmin.listTopics(entity, pattern, limit);
    }

    public static KafkaTopicDetailDto describeTopic(ConnectionEntity entity, String topic) {
        return KafkaTopicAdmin.describeTopic(entity, topic);
    }

    public static KafkaMutationResultDto createTopic(
            ConnectionEntity entity,
            String name,
            Integer partitions,
            Short replicationFactor
    ) {
        return KafkaTopicAdmin.createTopic(entity, name, partitions, replicationFactor);
    }

    public static KafkaMutationResultDto deleteTopic(ConnectionEntity entity, String topic) {
        return KafkaTopicAdmin.deleteTopic(entity, topic);
    }

    public static KafkaMutationResultDto increasePartitions(
            ConnectionEntity entity,
            String topic,
            int partitions
    ) {
        return KafkaTopicAdmin.increasePartitions(entity, topic, partitions);
    }

    public static KafkaTopicConfigsDto describeTopicConfigs(ConnectionEntity entity, String topic) {
        return KafkaTopicAdmin.describeTopicConfigs(entity, topic);
    }

    public static KafkaMutationResultDto updateTopicConfigs(
            ConnectionEntity entity,
            String topic,
            Long retentionMs,
            Long retentionBytes
    ) {
        return KafkaTopicAdmin.updateTopicConfigs(entity, topic, retentionMs, retentionBytes);
    }

    public static KafkaMessagesResultDto consumeMessages(
            ConnectionEntity entity,
            String topic,
            Integer partition,
            Long offset,
            int limit,
            boolean fromBeginning
    ) {
        return KafkaMessageReader.consumeMessages(entity, topic, partition, offset, limit, fromBeginning);
    }

    public static KafkaProduceResultDto produceMessage(
            ConnectionEntity entity,
            String topic,
            String key,
            String value,
            Integer partition
    ) {
        return KafkaMessageProducer.produceMessage(entity, topic, key, value, partition);
    }

    public static KafkaConsumerGroupsResultDto listConsumerGroups(
            ConnectionEntity entity,
            String pattern,
            int limit
    ) {
        return KafkaConsumerGroupAdmin.listConsumerGroups(entity, pattern, limit);
    }

    public static KafkaConsumerGroupMetricsDto describeConsumerGroupMetrics(
            ConnectionEntity entity,
            String groupId,
            String topic
    ) {
        return KafkaConsumerGroupAdmin.describeGroupMetrics(entity, groupId, topic);
    }

    public static KafkaMutationResultDto resetConsumerGroupOffsets(
            ConnectionEntity entity,
            String groupId,
            String topic,
            String strategy
    ) {
        return KafkaConsumerGroupAdmin.resetOffsets(entity, groupId, topic, strategy);
    }

    public static List<String> listTopicNames(ConnectionEntity entity, String pattern, int limit) {
        return listTopics(entity, pattern, limit).topics();
    }
}
