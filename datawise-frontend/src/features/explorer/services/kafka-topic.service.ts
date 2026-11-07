export type {
    KafkaTopicsResult,
    KafkaTopicPartition,
    KafkaTopicDetail,
    KafkaBrokerNode,
    KafkaClusterInfo,
    KafkaMutationResult,
    KafkaTopicConfigs,
    KafkaMessage,
    KafkaMessagesResult,
    KafkaProduceResult,
    PublishTableToKafkaRequest,
    PublishTableToKafkaResult,
    KafkaConsumerGroupSummary,
    KafkaConsumerGroupsResult,
    KafkaConsumerGroupPartitionMetric,
    KafkaConsumerGroupMetrics,
} from '@/shared/api/kafka.types'

import type {KafkaMessage, KafkaTopicPartition} from '@/shared/api/kafka.types'

export function parseKafkaTopicFromNodeId(nodeId: string, connectionId: string): string | null {
    const prefix = `${connectionId}:kafka:`
    if (!nodeId.startsWith(prefix)) return null
    const topic = nodeId.slice(prefix.length)
    return topic || null
}

export function kafkaTopicNodeId(connectionId: string, topic: string): string {
    return `${connectionId}:kafka:${topic}`
}

export function isKafkaPartitionHealthy(partition: KafkaTopicPartition): boolean {
    if (partition.leader < 0) return false
    if (!partition.replicas.length) return true
    return partition.isr.length >= partition.replicas.length
}

export function kafkaPartitionMessageCount(partition: KafkaTopicPartition): number {
    return Math.max(0, partition.endOffset - partition.beginningOffset)
}

export function buildKafkaMessageSearchText(message: KafkaMessage): string {
    const headers = Object.entries(message.headers ?? {})
        .map(([key, value]) => `${key}=${value}`)
        .join(' ')
    return [message.key ?? '', message.value ?? '', headers].join(' ').toLowerCase()
}

export function filterKafkaMessages(messages: KafkaMessage[], query: string): KafkaMessage[] {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return messages
    return messages.filter((message) => buildKafkaMessageSearchText(message).includes(normalized))
}

export function sortKafkaMessagesByTimestamp(
    messages: KafkaMessage[],
    order: 'newest' | 'oldest',
): KafkaMessage[] {
    const sorted = [...messages]
    sorted.sort((left, right) =>
        order === 'newest' ? right.timestamp - left.timestamp : left.timestamp - right.timestamp,
    )
    return sorted
}
