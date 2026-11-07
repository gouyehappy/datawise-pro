package org.apache.datawise.backend.kafka;

import org.apache.datawise.backend.domain.KafkaBrokerNodeDto;
import org.apache.datawise.backend.domain.KafkaClusterInfoDto;
import org.apache.datawise.backend.domain.KafkaMutationResultDto;
import org.apache.datawise.backend.domain.KafkaTopicConfigsDto;
import org.apache.datawise.backend.domain.KafkaTopicDetailDto;
import org.apache.datawise.backend.domain.KafkaTopicPartitionDto;
import org.apache.datawise.backend.domain.KafkaTopicsResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AlterConfigOp;
import org.apache.kafka.clients.admin.Config;
import org.apache.kafka.clients.admin.ConfigEntry;
import org.apache.kafka.clients.admin.CreateTopicsResult;
import org.apache.kafka.clients.admin.DescribeClusterResult;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.ListTopicsOptions;
import org.apache.kafka.clients.admin.NewPartitions;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.common.Node;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.TopicPartitionInfo;
import org.apache.kafka.common.config.ConfigResource;
import org.apache.kafka.common.config.TopicConfig;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/** Topic listing, metadata, and admin mutations via AdminClient. */
public final class KafkaTopicAdmin {

    private static final int ADMIN_TIMEOUT_SECONDS = 15;

    private KafkaTopicAdmin() {
    }

    public static void ping(ConnectionEntity entity) throws Exception {
        try (AdminClient admin = AdminClient.create(KafkaClientFactory.adminProperties(entity))) {
            admin.listTopics(new ListTopicsOptions().timeoutMs(5000)).names().get(5, TimeUnit.SECONDS);
        }
    }

    public static KafkaClusterInfoDto describeCluster(ConnectionEntity entity) {
        try (AdminClient admin = AdminClient.create(KafkaClientFactory.adminProperties(entity))) {
            DescribeClusterResult result = admin.describeCluster();
            String clusterId = result.clusterId().get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            Node controller = result.controller().get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            Collection<Node> nodes = result.nodes().get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            List<KafkaBrokerNodeDto> brokers = nodes.stream()
                    .sorted(Comparator.comparingInt(Node::id))
                    .map(node -> new KafkaBrokerNodeDto(
                            node.id(),
                            node.host(),
                            node.port(),
                            node.rack()
                    ))
                    .toList();
            int controllerId = controller == null ? -1 : controller.id();
            return new KafkaClusterInfoDto(clusterId, controllerId, brokers);
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    public static KafkaTopicsResultDto listTopics(ConnectionEntity entity, String pattern, int limit) {
        int pageSize = limit <= 0 ? 200 : Math.min(limit, 500);
        try (AdminClient admin = AdminClient.create(KafkaClientFactory.adminProperties(entity))) {
            List<String> topics = new ArrayList<>(admin.listTopics().names().get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS));
            topics.sort(String.CASE_INSENSITIVE_ORDER);
            if (pattern != null && !pattern.isBlank()) {
                Pattern regex = Pattern.compile(convertGlobToRegex(pattern.trim()), Pattern.CASE_INSENSITIVE);
                topics = topics.stream().filter(name -> regex.matcher(name).matches()).toList();
            }
            int total = topics.size();
            if (topics.size() > pageSize) {
                topics = topics.subList(0, pageSize);
            }
            return new KafkaTopicsResultDto(topics, total);
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    public static KafkaTopicDetailDto describeTopic(ConnectionEntity entity, String topic) {
        if (topic == null || topic.isBlank()) {
            throw new IllegalArgumentException("Kafka topic is required");
        }
        String topicName = topic.trim();
        try (AdminClient admin = AdminClient.create(KafkaClientFactory.adminProperties(entity))) {
            TopicDescription description = admin.describeTopics(List.of(topicName))
                    .allTopicNames()
                    .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .get(topicName);
            if (description == null) {
                throw new IllegalArgumentException("Topic not found: " + topicName);
            }
            List<TopicPartitionInfo> partitions = description.partitions();
            short replication = partitions.isEmpty()
                    ? 0
                    : (short) partitions.get(0).replicas().size();

            Map<TopicPartition, OffsetSpec> earliestSpecs = new HashMap<>();
            Map<TopicPartition, OffsetSpec> latestSpecs = new HashMap<>();
            for (TopicPartitionInfo info : partitions) {
                TopicPartition tp = new TopicPartition(topicName, info.partition());
                earliestSpecs.put(tp, OffsetSpec.earliest());
                latestSpecs.put(tp, OffsetSpec.latest());
            }

            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> earliest =
                    admin.listOffsets(earliestSpecs).all().get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> latest =
                    admin.listOffsets(latestSpecs).all().get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            List<KafkaTopicPartitionDto> partitionDtos = new ArrayList<>();
            for (TopicPartitionInfo info : partitions) {
                TopicPartition tp = new TopicPartition(topicName, info.partition());
                long beginning = earliest.getOrDefault(tp, null) == null ? 0L : earliest.get(tp).offset();
                long end = latest.getOrDefault(tp, null) == null ? beginning : latest.get(tp).offset();
                int leader = info.leader() == null ? -1 : info.leader().id();
                List<Integer> replicas = info.replicas().stream().map(Node::id).toList();
                List<Integer> isr = info.isr().stream().map(Node::id).toList();
                partitionDtos.add(new KafkaTopicPartitionDto(
                        info.partition(),
                        beginning,
                        end,
                        leader,
                        replicas,
                        isr
                ));
            }
            partitionDtos.sort(Comparator.comparingInt(KafkaTopicPartitionDto::partition));
            return new KafkaTopicDetailDto(
                    description.name(),
                    partitions.size(),
                    replication,
                    partitionDtos
            );
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    public static KafkaMutationResultDto createTopic(
            ConnectionEntity entity,
            String name,
            Integer partitions,
            Short replicationFactor
    ) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Kafka topic name is required");
        }
        String topicName = name.trim();
        int partitionCount = partitions == null || partitions <= 0 ? 1 : Math.min(partitions, 256);
        short rf = replicationFactor == null || replicationFactor <= 0
                ? 1
                : (short) Math.min(replicationFactor, 10);
        try (AdminClient admin = AdminClient.create(KafkaClientFactory.adminProperties(entity))) {
            NewTopic topic = new NewTopic(topicName, partitionCount, rf);
            CreateTopicsResult result = admin.createTopics(List.of(topic));
            result.all().get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return new KafkaMutationResultDto(true, "Topic created: " + topicName);
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    public static KafkaMutationResultDto deleteTopic(ConnectionEntity entity, String topic) {
        if (topic == null || topic.isBlank()) {
            throw new IllegalArgumentException("Kafka topic is required");
        }
        String topicName = topic.trim();
        try (AdminClient admin = AdminClient.create(KafkaClientFactory.adminProperties(entity))) {
            admin.deleteTopics(List.of(topicName)).all().get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return new KafkaMutationResultDto(true, "Topic deleted: " + topicName);
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    public static KafkaMutationResultDto increasePartitions(
            ConnectionEntity entity,
            String topic,
            int partitions
    ) {
        if (topic == null || topic.isBlank()) {
            throw new IllegalArgumentException("Kafka topic is required");
        }
        if (partitions <= 0) {
            throw new IllegalArgumentException("Partition count must be positive");
        }
        String topicName = topic.trim();
        try (AdminClient admin = AdminClient.create(KafkaClientFactory.adminProperties(entity))) {
            TopicDescription description = admin.describeTopics(List.of(topicName))
                    .allTopicNames()
                    .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .get(topicName);
            if (description == null) {
                throw new IllegalArgumentException("Topic not found: " + topicName);
            }
            int current = description.partitions().size();
            if (partitions <= current) {
                throw new IllegalArgumentException(
                        "New partition count must be greater than current (" + current + ")"
                );
            }
            admin.createPartitions(Map.of(topicName, NewPartitions.increaseTo(partitions)))
                    .all()
                    .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return new KafkaMutationResultDto(
                    true,
                    "Partitions increased from " + current + " to " + partitions
            );
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    public static KafkaTopicConfigsDto describeTopicConfigs(ConnectionEntity entity, String topic) {
        if (topic == null || topic.isBlank()) {
            throw new IllegalArgumentException("Kafka topic is required");
        }
        String topicName = topic.trim();
        try (AdminClient admin = AdminClient.create(KafkaClientFactory.adminProperties(entity))) {
            ConfigResource resource = new ConfigResource(ConfigResource.Type.TOPIC, topicName);
            Config config = admin.describeConfigs(List.of(resource))
                    .all()
                    .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .get(resource);
            if (config == null) {
                throw new IllegalArgumentException("Topic configs not found: " + topicName);
            }
            return new KafkaTopicConfigsDto(
                    topicName,
                    parseLongConfig(config, TopicConfig.RETENTION_MS_CONFIG),
                    parseLongConfig(config, TopicConfig.RETENTION_BYTES_CONFIG)
            );
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    public static KafkaMutationResultDto updateTopicConfigs(
            ConnectionEntity entity,
            String topic,
            Long retentionMs,
            Long retentionBytes
    ) {
        if (topic == null || topic.isBlank()) {
            throw new IllegalArgumentException("Kafka topic is required");
        }
        if (retentionMs == null && retentionBytes == null) {
            throw new IllegalArgumentException("At least one config value is required");
        }
        String topicName = topic.trim();
        try (AdminClient admin = AdminClient.create(KafkaClientFactory.adminProperties(entity))) {
            ConfigResource resource = new ConfigResource(ConfigResource.Type.TOPIC, topicName);
            List<AlterConfigOp> ops = new ArrayList<>();
            if (retentionMs != null) {
                ops.add(new AlterConfigOp(
                        new ConfigEntry(TopicConfig.RETENTION_MS_CONFIG, Long.toString(retentionMs)),
                        AlterConfigOp.OpType.SET
                ));
            }
            if (retentionBytes != null) {
                ops.add(new AlterConfigOp(
                        new ConfigEntry(TopicConfig.RETENTION_BYTES_CONFIG, Long.toString(retentionBytes)),
                        AlterConfigOp.OpType.SET
                ));
            }
            admin.incrementalAlterConfigs(Map.of(resource, ops))
                    .all()
                    .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return new KafkaMutationResultDto(true, "Topic configs updated: " + topicName);
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    private static Long parseLongConfig(Config config, String key) {
        ConfigEntry entry = config.get(key);
        if (entry == null || entry.value() == null || entry.value().isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(entry.value().trim());
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    static String convertGlobToRegex(String pattern) {
        StringBuilder regex = new StringBuilder("^");
        for (int i = 0; i < pattern.length(); i++) {
            char ch = pattern.charAt(i);
            if (ch == '*') {
                regex.append(".*");
            } else if ("\\.[]{}()+?^$|".indexOf(ch) >= 0) {
                regex.append('\\').append(ch);
            } else {
                regex.append(ch);
            }
        }
        return regex.append('$').toString();
    }
}
