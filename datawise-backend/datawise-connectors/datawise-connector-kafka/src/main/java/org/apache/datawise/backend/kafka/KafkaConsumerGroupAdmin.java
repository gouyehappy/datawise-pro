package org.apache.datawise.backend.kafka;

import org.apache.datawise.backend.domain.KafkaConsumerGroupMetricsDto;
import org.apache.datawise.backend.domain.KafkaConsumerGroupPartitionMetricDto;
import org.apache.datawise.backend.domain.KafkaConsumerGroupSummaryDto;
import org.apache.datawise.backend.domain.KafkaConsumerGroupsResultDto;
import org.apache.datawise.backend.domain.KafkaMutationResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.ConsumerGroupDescription;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.MemberDescription;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.TopicPartitionInfo;
import org.apache.kafka.common.ConsumerGroupState;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Consumer group listing and lag metrics via AdminClient. */
public final class KafkaConsumerGroupAdmin {

    private static final int ADMIN_TIMEOUT_SECONDS = 15;

    private KafkaConsumerGroupAdmin() {
    }

    public static KafkaConsumerGroupsResultDto listConsumerGroups(
            ConnectionEntity entity,
            String pattern,
            int limit
    ) {
        int pageSize = limit <= 0 ? 200 : Math.min(limit, 500);
        try (AdminClient admin = AdminClient.create(KafkaClientFactory.adminProperties(entity))) {
            List<KafkaConsumerGroupSummaryDto> groups = admin.listConsumerGroups().all().get(
                    ADMIN_TIMEOUT_SECONDS,
                    TimeUnit.SECONDS
            ).stream()
                    .map(listing -> new KafkaConsumerGroupSummaryDto(
                            listing.groupId(),
                            listing.state().map(Enum::name).orElse("UNKNOWN")
                    ))
                    .sorted(Comparator.comparing(KafkaConsumerGroupSummaryDto::groupId, String.CASE_INSENSITIVE_ORDER))
                    .toList();

            if (pattern != null && !pattern.isBlank()) {
                Pattern regex = Pattern.compile(
                        KafkaTopicAdmin.convertGlobToRegex(pattern.trim()),
                        Pattern.CASE_INSENSITIVE
                );
                groups = groups.stream()
                        .filter(group -> regex.matcher(group.groupId()).matches())
                        .toList();
            }

            int total = groups.size();
            if (groups.size() > pageSize) {
                groups = groups.subList(0, pageSize);
            }
            return new KafkaConsumerGroupsResultDto(groups, total);
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    public static KafkaConsumerGroupMetricsDto describeGroupMetrics(
            ConnectionEntity entity,
            String groupId,
            String topic
    ) {
        if (groupId == null || groupId.isBlank()) {
            throw new IllegalArgumentException("Kafka consumer group is required");
        }
        String normalizedGroupId = groupId.trim();
        String topicFilter = topic == null || topic.isBlank() ? null : topic.trim();

        try (AdminClient admin = AdminClient.create(KafkaClientFactory.adminProperties(entity))) {
            ConsumerGroupDescription description = admin.describeConsumerGroups(List.of(normalizedGroupId))
                    .all()
                    .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .get(normalizedGroupId);
            if (description == null) {
                throw new IllegalArgumentException("Consumer group not found: " + normalizedGroupId);
            }

            Map<TopicPartition, OffsetAndMetadata> committedOffsets = admin
                    .listConsumerGroupOffsets(normalizedGroupId)
                    .partitionsToOffsetAndMetadata()
                    .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            List<TopicPartition> topicPartitions = committedOffsets.keySet().stream()
                    .filter(tp -> topicFilter == null || topicFilter.equals(tp.topic()))
                    .sorted(Comparator.comparing(TopicPartition::topic).thenComparingInt(TopicPartition::partition))
                    .toList();

            Map<TopicPartition, Long> endOffsets = fetchEndOffsets(admin, topicPartitions);
            Map<TopicPartition, String> partitionOwners = buildPartitionOwners(description);

            List<KafkaConsumerGroupPartitionMetricDto> partitions = new ArrayList<>();
            long totalLag = 0L;
            for (TopicPartition tp : topicPartitions) {
                OffsetAndMetadata committed = committedOffsets.get(tp);
                long committedOffset = committed == null ? -1L : committed.offset();
                long endOffset = endOffsets.getOrDefault(tp, 0L);
                long lag = computeLag(committedOffset, endOffset);
                totalLag += lag;
                partitions.add(new KafkaConsumerGroupPartitionMetricDto(
                        tp.topic(),
                        tp.partition(),
                        committedOffset,
                        endOffset,
                        lag,
                        partitionOwners.get(tp)
                ));
            }

            return new KafkaConsumerGroupMetricsDto(
                    normalizedGroupId,
                    describeState(description),
                    description.members().size(),
                    totalLag,
                    partitions
            );
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    public static KafkaMutationResultDto resetOffsets(
            ConnectionEntity entity,
            String groupId,
            String topic,
            String strategy
    ) {
        if (groupId == null || groupId.isBlank()) {
            throw new IllegalArgumentException("Kafka consumer group is required");
        }
        if (topic == null || topic.isBlank()) {
            throw new IllegalArgumentException("Kafka topic is required");
        }
        String normalizedGroupId = groupId.trim();
        String topicName = topic.trim();
        String normalizedStrategy = strategy == null ? "" : strategy.trim().toLowerCase();
        if (!"earliest".equals(normalizedStrategy) && !"latest".equals(normalizedStrategy)) {
            throw new IllegalArgumentException("Reset strategy must be earliest or latest");
        }

        try (AdminClient admin = AdminClient.create(KafkaClientFactory.adminProperties(entity))) {
            TopicDescription description = admin.describeTopics(List.of(topicName))
                    .allTopicNames()
                    .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .get(topicName);
            if (description == null) {
                throw new IllegalArgumentException("Topic not found: " + topicName);
            }

            Map<TopicPartition, OffsetSpec> specs = new LinkedHashMap<>();
            for (TopicPartitionInfo info : description.partitions()) {
                TopicPartition tp = new TopicPartition(topicName, info.partition());
                specs.put(
                        tp,
                        "earliest".equals(normalizedStrategy) ? OffsetSpec.earliest() : OffsetSpec.latest()
                );
            }
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> targets =
                    admin.listOffsets(specs).all().get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            Map<TopicPartition, OffsetAndMetadata> offsets = new LinkedHashMap<>();
            for (Map.Entry<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> entry : targets.entrySet()) {
                offsets.put(entry.getKey(), new OffsetAndMetadata(entry.getValue().offset()));
            }
            admin.alterConsumerGroupOffsets(normalizedGroupId, offsets)
                    .all()
                    .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return new KafkaMutationResultDto(
                    true,
                    "Offsets reset to " + normalizedStrategy + " for group " + normalizedGroupId
                            + " on topic " + topicName
            );
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        }
    }

    static long computeLag(long committedOffset, long endOffset) {
        if (committedOffset < 0) {
            return Math.max(0L, endOffset);
        }
        return Math.max(0L, endOffset - committedOffset);
    }

    private static String describeState(ConsumerGroupDescription description) {
        ConsumerGroupState state = description.state();
        return state == null ? "UNKNOWN" : state.name();
    }

    private static Map<TopicPartition, String> buildPartitionOwners(ConsumerGroupDescription description) {
        Map<TopicPartition, String> owners = new HashMap<>();
        for (MemberDescription member : description.members()) {
            String memberId = member.consumerId();
            if (member.assignment() == null || member.assignment().topicPartitions() == null) {
                continue;
            }
            for (TopicPartition tp : member.assignment().topicPartitions()) {
                owners.put(tp, memberId);
            }
        }
        return owners;
    }

    private static Map<TopicPartition, Long> fetchEndOffsets(
            AdminClient admin,
            List<TopicPartition> topicPartitions
    ) throws Exception {
        if (topicPartitions.isEmpty()) {
            return Map.of();
        }
        Map<TopicPartition, OffsetSpec> specs = new LinkedHashMap<>();
        for (TopicPartition tp : topicPartitions) {
            specs.put(tp, OffsetSpec.latest());
        }
        Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> latest =
                admin.listOffsets(specs).all().get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        return latest.entrySet().stream()
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        entry -> entry.getValue().offset(),
                        (left, right) -> left,
                        LinkedHashMap::new
                ));
    }
}
