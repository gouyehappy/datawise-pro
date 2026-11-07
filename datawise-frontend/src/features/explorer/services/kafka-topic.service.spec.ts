import {describe, expect, it} from 'vitest'
import {
    filterKafkaMessages,
    isKafkaPartitionHealthy,
    kafkaPartitionMessageCount,
    sortKafkaMessagesByTimestamp,
    type KafkaMessage,
    type KafkaTopicPartition,
} from '@/features/explorer/services/kafka-topic.service'

describe('kafka-topic.service helpers', () => {
    const messages: KafkaMessage[] = [
        {partition: 0, offset: 1, timestamp: 100, key: 'a', value: 'hello', headers: {}},
        {partition: 1, offset: 2, timestamp: 300, key: null, value: 'world', headers: {trace: 'xyz'}},
        {partition: 0, offset: 3, timestamp: 200, key: 'b', value: 'hello-world', headers: {}},
    ]

    it('filters messages by key/value/header text', () => {
        expect(filterKafkaMessages(messages, 'xyz')).toHaveLength(1)
        expect(filterKafkaMessages(messages, 'HELLO')).toHaveLength(2)
        expect(filterKafkaMessages(messages, '   ')).toHaveLength(3)
    })

    it('sorts messages by timestamp', () => {
        expect(sortKafkaMessagesByTimestamp(messages, 'newest').map((m) => m.offset)).toEqual([2, 3, 1])
        expect(sortKafkaMessagesByTimestamp(messages, 'oldest').map((m) => m.offset)).toEqual([1, 3, 2])
    })

    it('computes partition health and message count', () => {
        const healthy: KafkaTopicPartition = {
            partition: 0,
            beginningOffset: 10,
            endOffset: 25,
            leader: 1,
            replicas: [1, 2],
            isr: [1, 2],
        }
        const warn: KafkaTopicPartition = {
            partition: 1,
            beginningOffset: 0,
            endOffset: 5,
            leader: -1,
            replicas: [1, 2],
            isr: [1],
        }
        expect(isKafkaPartitionHealthy(healthy)).toBe(true)
        expect(isKafkaPartitionHealthy(warn)).toBe(false)
        expect(kafkaPartitionMessageCount(healthy)).toBe(15)
    })
})
