import type {TreeNode} from '@/core/types'
import {walkTree} from '@/core/utils/tree'
import type {PublishTableToKafkaRequest} from '@/features/explorer/services/kafka-topic.service'
import {resolveTableContext, type TableContext} from '@/features/explorer/services/table-context-actions.service'
import {
    extractConnectionsFromTree,
    type ExtractedConnection,
} from '@/features/explorer/utils/tree-targets'

import type {PublishTableToKafkaResult} from '@/features/explorer/services/kafka-topic.service'
import {resolveApiErrorMessage} from '@/shared/api/http/api-error-message'
import type {ComposerTranslation} from 'vue-i18n'

const NON_TABLE_SOURCE_DB_TYPES = new Set(['kafka', 'redis'])

export const KAFKA_PUBLISH_DEFAULT_MAX_MESSAGES = 100
export const KAFKA_PUBLISH_MAX_MESSAGES_CAP = 10_000
export const KAFKA_PUBLISH_MAX_INTERVAL_MS = 300_000
export const KAFKA_PUBLISH_TOPIC_PREFIX = 'stream_'

export function buildDefaultKafkaTopicForTable(tableName: string): string {
    const trimmed = tableName.trim()
    if (!trimmed) return ''
    return `${KAFKA_PUBLISH_TOPIC_PREFIX}${trimmed}`
}

export interface KafkaTablePublishContext {
    sourceConnectionId: string
    sourceConnectionLabel: string
    sourceDatabase: string
    tableName: string
}

export type KafkaTablePublishDataSource = 'table' | 'fake'

export interface KafkaTablePublishForm {
    kafkaConnectionId: string
    topic: string
    keyColumn: string
    maxMessages: number
    intervalMs: number
    partition: string
    dataSource: KafkaTablePublishDataSource
    continuous: boolean
}

export interface KafkaTablePublishSourceForm {
    sourceConnectionId: string
    sourceDatabase: string
    tableName: string
}

export interface KafkaConnectionOption {
    id: string
    label: string
}

export function resolveKafkaTablePublishContext(
    tree: TreeNode[],
    node: TreeNode,
    connectionLabel?: string,
): KafkaTablePublishContext | null {
    const ctx = resolveTableContext(tree, node)
    if (!ctx) return null
    return toPublishContext(ctx, connectionLabel)
}

export function toPublishContext(
    ctx: TableContext,
    connectionLabel?: string,
): KafkaTablePublishContext {
    return {
        sourceConnectionId: ctx.connectionId,
        sourceConnectionLabel: connectionLabel ?? ctx.connectionId,
        sourceDatabase: ctx.database,
        tableName: ctx.tableName,
    }
}

export function listKafkaConnections(tree: TreeNode[]): KafkaConnectionOption[] {
    const items: KafkaConnectionOption[] = []
    walkTree(tree, (node) => {
        if (node.type === 'connection' && node.dbType === 'kafka') {
            items.push({id: node.id, label: node.label})
        }
    })
    return items
}

export function listPublishSourceConnections(tree: TreeNode[]): ExtractedConnection[] {
    return extractConnectionsFromTree(tree).filter(
        (item) => !NON_TABLE_SOURCE_DB_TYPES.has(item.dbType),
    )
}

export function createDefaultKafkaTablePublishSourceForm(): KafkaTablePublishSourceForm {
    return {
        sourceConnectionId: '',
        sourceDatabase: '',
        tableName: '',
    }
}

export function createDefaultKafkaTablePublishForm(
    kafkaConnections: KafkaConnectionOption[],
    presetKafkaConnectionId?: string | null,
): KafkaTablePublishForm {
    const preset = presetKafkaConnectionId?.trim()
    const kafkaConnectionId = preset && kafkaConnections.some((item) => item.id === preset)
        ? preset
        : kafkaConnections[0]?.id ?? ''
    return {
        kafkaConnectionId,
        topic: '',
        keyColumn: '',
        maxMessages: KAFKA_PUBLISH_DEFAULT_MAX_MESSAGES,
        intervalMs: 0,
        partition: '',
        dataSource: 'table',
        continuous: false,
    }
}

export function buildKafkaTablePublishContextFromSource(
    sourceConnections: ExtractedConnection[],
    source: KafkaTablePublishSourceForm,
): KafkaTablePublishContext | null {
    const connection = sourceConnections.find((item) => item.id === source.sourceConnectionId)
    if (!connection) return null
    const database = source.sourceDatabase.trim()
    const tableName = source.tableName.trim()
    if (!database || !tableName) return null
    return {
        sourceConnectionId: connection.id,
        sourceConnectionLabel: connection.label,
        sourceDatabase: database,
        tableName,
    }
}

export function validateKafkaTablePublishSourceForm(
    source: KafkaTablePublishSourceForm,
    sourceConnections: ExtractedConnection[],
): string | null {
    if (!sourceConnections.length) return 'noSourceConnections'
    if (!source.sourceConnectionId.trim()) return 'sourceConnectionRequired'
    if (!source.sourceDatabase.trim()) return 'sourceDatabaseRequired'
    if (!source.tableName.trim()) return 'sourceTableRequired'
    return null
}

export function validateKafkaTablePublishForm(
    form: KafkaTablePublishForm,
    kafkaConnections: KafkaConnectionOption[],
): string | null {
    if (!kafkaConnections.length) return 'noKafkaConnections'
    if (!form.kafkaConnectionId.trim()) return 'kafkaConnectionRequired'
    if (!form.topic.trim()) return 'topicRequired'
    if (!Number.isFinite(form.maxMessages) || form.maxMessages < 1 || form.maxMessages > KAFKA_PUBLISH_MAX_MESSAGES_CAP) {
        return 'invalidMaxMessages'
    }
    if (!Number.isFinite(form.intervalMs) || form.intervalMs < 0 || form.intervalMs > KAFKA_PUBLISH_MAX_INTERVAL_MS) {
        return 'invalidIntervalMs'
    }
    if (form.partition.trim() !== '') {
        const partition = Number(form.partition)
        if (!Number.isInteger(partition) || partition < 0) return 'invalidPartition'
    }
    return null
}

export function buildPublishTableToKafkaRequest(
    context: KafkaTablePublishContext,
    form: KafkaTablePublishForm,
    options?: {
        datagenSeed?: number
        datagenRowOffset?: number
    },
): PublishTableToKafkaRequest {
    const partition = form.partition.trim() === '' ? null : Number(form.partition)
    return {
        sourceConnectionId: context.sourceConnectionId,
        sourceDatabase: context.sourceDatabase || null,
        tableName: context.tableName,
        topic: form.topic.trim(),
        keyColumn: form.keyColumn.trim() || null,
        maxMessages: form.maxMessages,
        intervalMs: form.intervalMs,
        partition: Number.isFinite(partition) ? partition : null,
        fakeData: form.dataSource === 'fake',
        datagenSeed: options?.datagenSeed ?? null,
        datagenRowOffset: options?.datagenRowOffset ?? null,
    }
}

export function resolveKafkaTablePublishErrorMessage(error: unknown, t: ComposerTranslation): string {
    const raw = resolveApiErrorMessage(error)
    if (raw === 'CONNECTION_ACCESS_DENIED' || raw.startsWith('CONNECTION_ACCESS_DENIED')) {
        return t('explorer.kafkaTablePublish.errors.connectionAccessDenied')
    }
    return raw
}

export function formatKafkaTablePublishSuccess(
    result: PublishTableToKafkaResult,
    t: ComposerTranslation,
): string {
    const reasonKey = result.stopReason === 'USER_STOPPED'
        ? 'USER_STOPPED'
        : result.stopReason
    const reason = t(`explorer.kafkaTablePublish.stopReason.${reasonKey}`)
    return t('explorer.kafkaTablePublish.successDetail', {
        sent: result.messagesSent,
        failed: result.messagesFailed,
        durationMs: result.durationMs,
        reason,
    })
}

export function formatKafkaTablePublishProgress(
    sent: number,
    failed: number,
    t: ComposerTranslation,
): string {
    return t('explorer.kafkaTablePublish.continuousProgress', {sent, failed})
}

export function aggregatePublishResults(
    results: PublishTableToKafkaResult[],
    stoppedByUser: boolean,
): PublishTableToKafkaResult {
    if (!results.length) {
        return {
            messagesSent: 0,
            messagesFailed: 0,
            durationMs: 0,
            stopReason: stoppedByUser ? 'USER_STOPPED' : 'TABLE_EXHAUSTED',
            lastError: null,
            lastProduce: null,
        }
    }
    const last = results[results.length - 1]!
    return {
        messagesSent: results.reduce((sum, item) => sum + item.messagesSent, 0),
        messagesFailed: results.reduce((sum, item) => sum + item.messagesFailed, 0),
        durationMs: results.reduce((sum, item) => sum + item.durationMs, 0),
        stopReason: stoppedByUser ? 'USER_STOPPED' : last.stopReason,
        lastError: last.lastError ?? null,
        lastProduce: last.lastProduce ?? null,
    }
}
