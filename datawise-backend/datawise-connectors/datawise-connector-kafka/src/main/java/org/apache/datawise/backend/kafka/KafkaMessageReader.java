package org.apache.datawise.backend.kafka;

import org.apache.datawise.backend.domain.KafkaMessageDto;
import org.apache.datawise.backend.domain.KafkaMessagesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Reads topic messages without committing consumer offsets. */
public final class KafkaMessageReader {

    private static final Duration POLL_TIMEOUT = Duration.ofMillis(500);
    private static final int MAX_EMPTY_POLLS_BEGINNING = 2;
    private static final int MAX_EMPTY_POLLS_LATEST = 1;

    private KafkaMessageReader() {
    }

    public static KafkaMessagesResultDto consumeMessages(
            ConnectionEntity entity,
            String topic,
            Integer partition,
            Long offset,
            int limit,
            boolean fromBeginning
    ) {
        if (topic == null || topic.isBlank()) {
            throw new IllegalArgumentException("Kafka topic is required");
        }
        int maxRecords = limit <= 0 ? 20 : Math.min(limit, 100);
        var props = KafkaClientFactory.consumerProperties(entity);
        if (fromBeginning) {
            props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        }
        try (Consumer<String, String> consumer = new KafkaConsumer<>(
                props,
                new StringDeserializer(),
                new StringDeserializer()
        )) {
            List<TopicPartition> assignments = resolvePartitions(consumer, topic.trim(), partition);
            if (assignments.isEmpty()) {
                return new KafkaMessagesResultDto(List.of(), false);
            }
            consumer.assign(assignments);

            Map<TopicPartition, Long> endOffsets = consumer.endOffsets(assignments);
            List<TopicPartition> readable = filterReadablePartitions(endOffsets, assignments, fromBeginning, offset);
            if (readable.isEmpty()) {
                return new KafkaMessagesResultDto(List.of(), false);
            }
            if (readable.size() != assignments.size()) {
                consumer.assign(readable);
            }

            seekPartitions(consumer, readable, endOffsets, offset, fromBeginning);

            List<KafkaMessageDto> messages = new ArrayList<>();
            int maxEmptyPolls = fromBeginning ? MAX_EMPTY_POLLS_BEGINNING : MAX_EMPTY_POLLS_LATEST;
            int emptyPolls = 0;
            while (messages.size() < maxRecords && emptyPolls < maxEmptyPolls) {
                ConsumerRecords<String, String> records = consumer.poll(POLL_TIMEOUT);
                if (records.isEmpty()) {
                    emptyPolls++;
                    continue;
                }
                emptyPolls = 0;
                for (ConsumerRecord<String, String> record : records) {
                    messages.add(toDto(record));
                    if (messages.size() >= maxRecords) {
                        break;
                    }
                }
                if (!fromBeginning) {
                    break;
                }
            }
            messages.sort((left, right) -> {
                int partitionCompare = Integer.compare(left.partition(), right.partition());
                if (partitionCompare != 0) {
                    return partitionCompare;
                }
                return Long.compare(left.offset(), right.offset());
            });
            boolean hasMore = messages.size() >= maxRecords;
            return new KafkaMessagesResultDto(messages, hasMore);
        }
    }

    static List<TopicPartition> resolvePartitions(
            Consumer<String, String> consumer,
            String topic,
            Integer partition
    ) {
        if (partition != null && partition >= 0) {
            return List.of(new TopicPartition(topic, partition));
        }
        List<TopicPartition> partitions = new ArrayList<>(
                consumer.partitionsFor(topic).stream()
                        .map(info -> new TopicPartition(topic, info.partition()))
                        .toList()
        );
        Collections.sort(partitions, (a, b) -> Integer.compare(a.partition(), b.partition()));
        return partitions;
    }

    static List<TopicPartition> filterReadablePartitions(
            Map<TopicPartition, Long> endOffsets,
            List<TopicPartition> partitions,
            boolean fromBeginning,
            Long offset
    ) {
        if (fromBeginning || offset != null) {
            return partitions;
        }
        List<TopicPartition> readable = new ArrayList<>();
        for (TopicPartition partition : partitions) {
            if (endOffsets.getOrDefault(partition, 0L) > 0L) {
                readable.add(partition);
            }
        }
        return readable;
    }

    static void seekPartitions(
            Consumer<String, String> consumer,
            List<TopicPartition> partitions,
            Map<TopicPartition, Long> endOffsets,
            Long offset,
            boolean fromBeginning
    ) {
        if (offset != null && offset >= 0 && partitions.size() == 1) {
            consumer.seek(partitions.get(0), offset);
            return;
        }
        if (fromBeginning) {
            consumer.seekToBeginning(partitions);
            return;
        }
        for (TopicPartition tp : partitions) {
            long end = endOffsets.getOrDefault(tp, 0L);
            consumer.seek(tp, latestPeekOffset(end));
        }
    }

    static long latestPeekOffset(long endOffset) {
        return Math.max(0L, endOffset - 1L);
    }

    static KafkaMessageDto toDto(ConsumerRecord<String, String> record) {
        Map<String, String> headers = new LinkedHashMap<>();
        record.headers().forEach(header -> headers.put(header.key(), header.value() == null ? "" : new String(header.value())));
        return new KafkaMessageDto(
                record.partition(),
                record.offset(),
                record.timestamp(),
                record.key(),
                record.value(),
                headers
        );
    }
}
