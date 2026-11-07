package org.apache.datawise.backend.kafka;

import org.apache.kafka.common.TopicPartition;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KafkaMessageReaderTest {

    @Test
    void latestPeekOffset_usesLastReadableOffset() {
        assertEquals(0L, KafkaMessageReader.latestPeekOffset(1L));
        assertEquals(9L, KafkaMessageReader.latestPeekOffset(10L));
        assertEquals(0L, KafkaMessageReader.latestPeekOffset(0L));
    }

    @Test
    void filterReadablePartitions_skipsEmptyPartitionsInLatestMode() {
        TopicPartition p0 = new TopicPartition("orders", 0);
        TopicPartition p1 = new TopicPartition("orders", 1);
        Map<TopicPartition, Long> endOffsets = Map.of(p0, 0L, p1, 12L);

        List<TopicPartition> readable = KafkaMessageReader.filterReadablePartitions(
                endOffsets,
                List.of(p0, p1),
                false,
                null
        );

        assertEquals(List.of(p1), readable);
    }

    @Test
    void filterReadablePartitions_keepsAllPartitionsForBeginningMode() {
        TopicPartition p0 = new TopicPartition("orders", 0);
        TopicPartition p1 = new TopicPartition("orders", 1);
        Map<TopicPartition, Long> endOffsets = Map.of(p0, 0L, p1, 12L);

        List<TopicPartition> readable = KafkaMessageReader.filterReadablePartitions(
                endOffsets,
                List.of(p0, p1),
                true,
                null
        );

        assertEquals(List.of(p0, p1), readable);
    }

    @Test
    void filterReadablePartitions_returnsEmptyWhenAllPartitionsEmpty() {
        TopicPartition p0 = new TopicPartition("orders", 0);
        List<TopicPartition> readable = KafkaMessageReader.filterReadablePartitions(
                Map.of(p0, 0L),
                List.of(p0),
                false,
                null
        );

        assertTrue(readable.isEmpty());
    }
}
