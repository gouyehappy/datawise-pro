package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.KafkaClusterInfoDto;
import org.apache.datawise.backend.domain.KafkaConsumerGroupMetricsDto;
import org.apache.datawise.backend.domain.KafkaConsumerGroupsResultDto;
import org.apache.datawise.backend.domain.KafkaMessagesResultDto;
import org.apache.datawise.backend.domain.KafkaMutationResultDto;
import org.apache.datawise.backend.domain.KafkaProduceResultDto;
import org.apache.datawise.backend.domain.KafkaTopicConfigsDto;
import org.apache.datawise.backend.domain.KafkaTopicDetailDto;
import org.apache.datawise.backend.domain.KafkaTopicsResultDto;
import org.apache.datawise.backend.domain.PublishTableToKafkaRequest;
import org.apache.datawise.backend.domain.PublishTableToKafkaResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.database.kafka.KafkaTablePublishService;
import org.springframework.stereotype.Service;

/**
 * Kafka-specific Explorer operations kept outside schema/tree orchestration.
 */
@Service
public class ExplorerKafkaService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;
    private final KafkaTablePublishService kafkaTablePublishService;

    public ExplorerKafkaService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade,
            KafkaTablePublishService kafkaTablePublishService
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
        this.kafkaTablePublishService = kafkaTablePublishService;
    }

    public KafkaClusterInfoDto describeCluster(String connectionId) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.messageBroker().describeCluster(connection);
    }

    public KafkaTopicsResultDto listTopics(String connectionId, String pattern, Integer limit) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 200 : Math.min(limit, 500);
        return connectorFacade.messageBroker().listTopics(connection, pattern, pageSize);
    }

    public KafkaTopicDetailDto describeTopic(String connectionId, String topic) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.messageBroker().describeTopic(connection, topic);
    }

    public KafkaMutationResultDto createTopic(
            String connectionId,
            String name,
            Integer partitions,
            Short replicationFactor
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.messageBroker().createTopic(connection, name, partitions, replicationFactor);
    }

    public KafkaMutationResultDto deleteTopic(String connectionId, String topic) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.messageBroker().deleteTopic(connection, topic);
    }

    public KafkaMutationResultDto increasePartitions(String connectionId, String topic, int partitions) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.messageBroker().increasePartitions(connection, topic, partitions);
    }

    public KafkaTopicConfigsDto describeTopicConfigs(String connectionId, String topic) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.messageBroker().describeTopicConfigs(connection, topic);
    }

    public KafkaMutationResultDto updateTopicConfigs(
            String connectionId,
            String topic,
            Long retentionMs,
            Long retentionBytes
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.messageBroker().updateTopicConfigs(connection, topic, retentionMs, retentionBytes);
    }

    public KafkaMessagesResultDto consumeMessages(
            String connectionId,
            String topic,
            Integer partition,
            Long offset,
            Integer limit,
            Boolean fromBeginning
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 20 : Math.min(limit, 100);
        boolean readFromBeginning = Boolean.TRUE.equals(fromBeginning);
        return connectorFacade.messageBroker().consumeMessages(
                connection, topic, partition, offset, pageSize, readFromBeginning
        );
    }

    public KafkaProduceResultDto produceMessage(
            String connectionId,
            String topic,
            String key,
            String value,
            Integer partition
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.messageBroker().produceMessage(
                connection, topic, key, value, partition
        );
    }

    public PublishTableToKafkaResult publishTable(String kafkaConnectionId, PublishTableToKafkaRequest request) {
        return kafkaTablePublishService.publish(kafkaConnectionId, request);
    }

    public KafkaConsumerGroupsResultDto listConsumerGroups(
            String connectionId,
            String pattern,
            Integer limit
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        int pageSize = limit == null || limit <= 0 ? 200 : Math.min(limit, 500);
        return connectorFacade.messageBroker().listConsumerGroups(connection, pattern, pageSize);
    }

    public KafkaConsumerGroupMetricsDto describeConsumerGroupMetrics(
            String connectionId,
            String groupId,
            String topic
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.messageBroker().describeConsumerGroupMetrics(connection, groupId, topic);
    }

    public KafkaMutationResultDto resetConsumerGroupOffsets(
            String connectionId,
            String groupId,
            String topic,
            String strategy
    ) {
        ConnectionEntity connection = requireAvailableExplorerConnection(connectionId);
        return connectorFacade.messageBroker().resetConsumerGroupOffsets(connection, groupId, topic, strategy);
    }

    private ConnectionEntity requireAvailableExplorerConnection(String connectionId) {
        return connectionContext.requireAvailableConnectionForCurrentUser(
                connectionId,
                ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND
        ).entity();
    }
}
