import {
    KAFKA_PUBLISH_MAX_INTERVAL_MS,
    KAFKA_PUBLISH_MAX_MESSAGES_CAP,
    type KafkaTablePublishForm,
} from '@/features/explorer/services/kafka-table-publish.service'

export type KafkaPublishCanvasNodeKind = 'source' | 'options' | 'kafka'

export type KafkaPublishCanvasNodeStatus = 'ready' | 'incomplete' | 'idle'

export interface KafkaPublishCanvasNode {
    id: KafkaPublishCanvasNodeKind
    kind: KafkaPublishCanvasNodeKind
    title: string
    subtitle: string
    badge: string
    status: KafkaPublishCanvasNodeStatus
    x: number
    y: number
    width: number
    height: number
}

export interface KafkaPublishCanvasEdge {
    id: string
    fromId: KafkaPublishCanvasNodeKind
    toId: KafkaPublishCanvasNodeKind
    label: string
    animated?: boolean
}

export interface KafkaPublishCanvasLayout {
    nodes: KafkaPublishCanvasNode[]
    edges: KafkaPublishCanvasEdge[]
}

export type KafkaPublishCanvasPositionOverrides = Record<string, {x: number; y: number}>

const NODE_W = 168
const NODE_H = 96
const GAP_X = 64
const PAD = 28
const NODE_Y = 36

const NODE_ORDER: KafkaPublishCanvasNodeKind[] = ['source', 'options', 'kafka']

export function isKafkaPublishOptionsReady(form: Pick<
    KafkaTablePublishForm,
    'maxMessages' | 'intervalMs' | 'partition'
>): boolean {
    if (!Number.isFinite(form.maxMessages)
        || form.maxMessages < 1
        || form.maxMessages > KAFKA_PUBLISH_MAX_MESSAGES_CAP) {
        return false
    }
    if (!Number.isFinite(form.intervalMs)
        || form.intervalMs < 0
        || form.intervalMs > KAFKA_PUBLISH_MAX_INTERVAL_MS) {
        return false
    }
    if (form.partition.trim() !== '') {
        const partition = Number(form.partition)
        if (!Number.isInteger(partition) || partition < 0) return false
    }
    return true
}

export function resolveKafkaPublishNodeStatuses(input: {
    hasSource: boolean
    optionsReady: boolean
    kafkaConnectionId: string
    topic: string
}): Record<KafkaPublishCanvasNodeKind, KafkaPublishCanvasNodeStatus> {
    return {
        source: input.hasSource ? 'ready' : 'incomplete',
        options: input.optionsReady ? 'ready' : 'incomplete',
        kafka:
            input.kafkaConnectionId.trim() && input.topic.trim()
                ? 'ready'
                : 'incomplete',
    }
}

export function layoutKafkaPublishCanvas(input: {
    sourceLabel: string
    sourceDetail: string
    optionsLabel: string
    optionsDetail: string
    kafkaLabel: string
    topic: string
    labels: {
        sourceBadge: string
        optionsBadge: string
        kafkaBadge: string
        sourceEmpty: string
        optionsEmpty: string
        kafkaEmpty: string
        topicEmpty: string
        edgeRead: string
        edgePublish: string
    }
    statuses: Record<KafkaPublishCanvasNodeKind, KafkaPublishCanvasNodeStatus>
    positionOverrides?: KafkaPublishCanvasPositionOverrides
}): KafkaPublishCanvasLayout {
    const overrides = input.positionOverrides ?? {}
    const nodes: KafkaPublishCanvasNode[] = NODE_ORDER.map((kind, index) => {
        const override = overrides[kind]
        const base = {
            id: kind,
            kind,
            status: input.statuses[kind],
            x: override?.x ?? PAD + index * (NODE_W + GAP_X),
            y: override?.y ?? NODE_Y,
            width: NODE_W,
            height: NODE_H,
        }
        switch (kind) {
            case 'source':
                return {
                    ...base,
                    badge: input.labels.sourceBadge,
                    title: input.sourceLabel || input.labels.sourceEmpty,
                    subtitle: input.sourceDetail || '—',
                }
            case 'options':
                return {
                    ...base,
                    badge: input.labels.optionsBadge,
                    title: input.optionsLabel || input.labels.optionsEmpty,
                    subtitle: input.optionsDetail || '—',
                }
            case 'kafka':
                return {
                    ...base,
                    badge: input.labels.kafkaBadge,
                    title: input.kafkaLabel || input.labels.kafkaEmpty,
                    subtitle: input.topic.trim() || input.labels.topicEmpty,
                }
        }
    })

    const allReady = NODE_ORDER.every((kind) => input.statuses[kind] === 'ready')
    const edges: KafkaPublishCanvasEdge[] = [
        {
            id: 'edge-source-options',
            fromId: 'source',
            toId: 'options',
            label: input.labels.edgeRead,
        },
        {
            id: 'edge-options-kafka',
            fromId: 'options',
            toId: 'kafka',
            label: input.labels.edgePublish,
            animated: allReady,
        },
    ]

    return {nodes, edges}
}

export function nextIncompleteKafkaPublishNode(
    statuses: Record<KafkaPublishCanvasNodeKind, KafkaPublishCanvasNodeStatus>,
    preferred: KafkaPublishCanvasNodeKind = 'source',
): KafkaPublishCanvasNodeKind {
    if (statuses[preferred] === 'incomplete') return preferred
    for (const kind of NODE_ORDER) {
        if (statuses[kind] === 'incomplete') return kind
    }
    return preferred
}

export {NODE_W as KAFKA_PUBLISH_CANVAS_NODE_W, NODE_H as KAFKA_PUBLISH_CANVAS_NODE_H}
