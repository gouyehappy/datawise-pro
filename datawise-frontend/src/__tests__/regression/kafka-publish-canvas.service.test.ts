import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    isKafkaPublishOptionsReady,
    layoutKafkaPublishCanvas,
    nextIncompleteKafkaPublishNode,
    resolveKafkaPublishNodeStatuses,
} from '@/features/workspace/services/kafka-publish-canvas.service'

const labels = {
    sourceBadge: 'Source',
    optionsBadge: 'Options',
    kafkaBadge: 'Kafka',
    sourceEmpty: 'Select source',
    optionsEmpty: 'Configure send',
    kafkaEmpty: 'Select Kafka',
    topicEmpty: 'Enter topic',
    edgeRead: 'Read',
    edgePublish: 'Publish',
}

describe('kafka-publish-canvas.service', () => {
    it('resolves node statuses from form completeness', () => {
        const incomplete = resolveKafkaPublishNodeStatuses({
            hasSource: false,
            optionsReady: true,
            kafkaConnectionId: '',
            topic: '',
        })
        assert.equal(incomplete.source, 'incomplete')
        assert.equal(incomplete.options, 'ready')
        assert.equal(incomplete.kafka, 'incomplete')

        const ready = resolveKafkaPublishNodeStatuses({
            hasSource: true,
            optionsReady: true,
            kafkaConnectionId: 'k1',
            topic: 'stream_orders',
        })
        assert.equal(ready.source, 'ready')
        assert.equal(ready.options, 'ready')
        assert.equal(ready.kafka, 'ready')
    })

    it('validates options readiness for maxMessages / interval / partition', () => {
        assert.equal(
            isKafkaPublishOptionsReady({maxMessages: 100, intervalMs: 0, partition: ''}),
            true,
        )
        assert.equal(
            isKafkaPublishOptionsReady({maxMessages: 0, intervalMs: 0, partition: ''}),
            false,
        )
        assert.equal(
            isKafkaPublishOptionsReady({maxMessages: 100, intervalMs: -1, partition: ''}),
            false,
        )
        assert.equal(
            isKafkaPublishOptionsReady({maxMessages: 100, intervalMs: 0, partition: '-1'}),
            false,
        )
        assert.equal(
            isKafkaPublishOptionsReady({maxMessages: 100, intervalMs: 0, partition: '2'}),
            true,
        )
    })

    it('layouts source → options → kafka left to right', () => {
        const statuses = resolveKafkaPublishNodeStatuses({
            hasSource: true,
            optionsReady: true,
            kafkaConnectionId: 'k1',
            topic: 'stream_t',
        })
        const layout = layoutKafkaPublishCanvas({
            sourceLabel: 'MySQL@localhost',
            sourceDetail: 'datadev.orders',
            optionsLabel: 'Table data',
            optionsDetail: '100 / batch',
            kafkaLabel: 'Kafka@local',
            topic: 'stream_orders',
            labels,
            statuses,
        })
        assert.equal(layout.nodes.length, 3)
        assert.equal(layout.edges.length, 2)
        assert.equal(layout.nodes[0].kind, 'source')
        assert.equal(layout.nodes[1].kind, 'options')
        assert.equal(layout.nodes[2].kind, 'kafka')
        assert.ok(layout.nodes[1].x > layout.nodes[0].x)
        assert.ok(layout.nodes[2].x > layout.nodes[1].x)
        assert.equal(layout.edges[0].label, 'Read')
        assert.equal(layout.edges[1].label, 'Publish')
        assert.equal(layout.edges[1].animated, true)
    })

    it('applies position overrides and keeps incomplete publish edge unanimated', () => {
        const statuses = resolveKafkaPublishNodeStatuses({
            hasSource: true,
            optionsReady: true,
            kafkaConnectionId: '',
            topic: '',
        })
        const layout = layoutKafkaPublishCanvas({
            sourceLabel: 'MySQL',
            sourceDetail: 'db.t',
            optionsLabel: 'Table data',
            optionsDetail: 'batch',
            kafkaLabel: '',
            topic: '',
            labels,
            statuses,
            positionOverrides: {
                source: {x: 12, y: 24},
                kafka: {x: 500, y: 90},
            },
        })
        assert.equal(layout.nodes[0].x, 12)
        assert.equal(layout.nodes[0].y, 24)
        assert.equal(layout.nodes[2].x, 500)
        assert.equal(layout.nodes[2].y, 90)
        assert.equal(layout.edges[1].animated, false)
        assert.equal(layout.nodes[2].title, 'Select Kafka')
        assert.equal(layout.nodes[2].subtitle, 'Enter topic')
    })

    it('picks the next incomplete node with preference', () => {
        const statuses = resolveKafkaPublishNodeStatuses({
            hasSource: true,
            optionsReady: true,
            kafkaConnectionId: '',
            topic: '',
        })
        assert.equal(nextIncompleteKafkaPublishNode(statuses, 'kafka'), 'kafka')
        assert.equal(nextIncompleteKafkaPublishNode(statuses, 'source'), 'kafka')

        const missingSource = resolveKafkaPublishNodeStatuses({
            hasSource: false,
            optionsReady: true,
            kafkaConnectionId: 'k1',
            topic: 't',
        })
        assert.equal(nextIncompleteKafkaPublishNode(missingSource, 'options'), 'source')
    })
})
