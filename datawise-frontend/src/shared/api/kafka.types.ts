/** Kafka topic / consumer / publish API DTOs. */
export type {KafkaTopicsResult} from './explorer-ops.types'

export interface KafkaTopicPartition {
    partition: number
    beginningOffset: number
    endOffset: number
    leader: number
    replicas: number[]
    isr: number[]
}

export interface KafkaTopicDetail {
    name: string
    partitionCount: number
    replicationFactor: number
    partitions: KafkaTopicPartition[]
}

export interface KafkaBrokerNode {
    id: number
    host: string
    port: number
    rack: string | null
}

export interface KafkaClusterInfo {
    clusterId: string | null
    controllerId: number
    brokers: KafkaBrokerNode[]
}

export interface KafkaMutationResult {
    success: boolean
    message: string
}

export interface KafkaTopicConfigs {
    topic: string
    retentionMs: number | null
    retentionBytes: number | null
}

export interface KafkaMessage {
    partition: number
    offset: number
    timestamp: number
    key: string | null
    value: string | null
    headers: Record<string, string>
}

export interface KafkaMessagesResult {
    messages: KafkaMessage[]
    hasMore: boolean
}

export interface KafkaProduceResult {
    topic: string
    partition: number
    offset: number
}

export interface PublishTableToKafkaRequest {
    sourceConnectionId: string
    sourceDatabase?: string | null
    tableName: string
    topic: string
    keyColumn?: string | null
    maxMessages?: number | null
    intervalMs?: number | null
    partition?: number | null
    fakeData?: boolean | null
    datagenSeed?: number | null
    datagenRowOffset?: number | null
}

export interface PublishTableToKafkaResult {
    messagesSent: number
    messagesFailed: number
    durationMs: number
    stopReason: string
    lastError?: string | null
    lastProduce?: KafkaProduceResult | null
}

export interface KafkaConsumerGroupSummary {
    groupId: string
    state: string
}

export interface KafkaConsumerGroupsResult {
    groups: KafkaConsumerGroupSummary[]
    totalCount: number
}

export interface KafkaConsumerGroupPartitionMetric {
    topic: string
    partition: number
    committedOffset: number
    endOffset: number
    lag: number
    memberId: string | null
}

export interface KafkaConsumerGroupMetrics {
    groupId: string
    state: string
    memberCount: number
    totalLag: number
    partitions: KafkaConsumerGroupPartitionMetric[]
}
