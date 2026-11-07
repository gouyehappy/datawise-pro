import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {ApiError} from '@/shared/api/http/request'
import {
    aggregatePublishResults,
    buildDefaultKafkaTopicForTable,
    buildPublishTableToKafkaRequest,
    buildKafkaTablePublishContextFromSource,
    createDefaultKafkaTablePublishForm,
    listKafkaConnections,
    listPublishSourceConnections,
    resolveKafkaTablePublishErrorMessage,
    validateKafkaTablePublishForm,
    validateKafkaTablePublishSourceForm,
} from '@/features/explorer/services/kafka-table-publish.service'
import type {TreeNode} from '@/core/types'

function t(key: string) {
    if (key.endsWith('connectionAccessDenied')) {
        return 'no write access'
    }
    return key
}

describe('kafka-table-publish.service', () => {
    const tree: TreeNode[] = [
        {
            id: 'g1',
            label: 'Default',
            type: 'group',
            children: [
                {
                    id: 'mysql-1',
                    label: 'shop mysql',
                    type: 'connection',
                    dbType: 'mysql',
                },
                {
                    id: 'kafka-1',
                    label: 'local kafka',
                    type: 'connection',
                    dbType: 'kafka',
                },
            ],
        },
    ]

    it('lists kafka connections from explorer tree', () => {
        assert.deepEqual(listKafkaConnections(tree), [{id: 'kafka-1', label: 'local kafka'}])
    })

    it('validates publish form bounds', () => {
        const connections = listKafkaConnections(tree)
        const form = {...createDefaultKafkaTablePublishForm(connections), topic: 'orders'}
        assert.equal(validateKafkaTablePublishForm(form, connections), null)

        assert.equal(
            validateKafkaTablePublishForm({...form, topic: ''}, connections),
            'topicRequired',
        )
        assert.equal(
            validateKafkaTablePublishForm({...form, maxMessages: 0}, connections),
            'invalidMaxMessages',
        )
        assert.equal(
            validateKafkaTablePublishForm({...form, intervalMs: -1}, connections),
            'invalidIntervalMs',
        )
    })

    it('maps connection access denied code to friendly message', () => {
        assert.equal(
            resolveKafkaTablePublishErrorMessage(new ApiError('CONNECTION_ACCESS_DENIED'), t),
            'no write access',
        )
    })

    it('lists publish source connections excluding kafka and redis', () => {
        const mixedTree: TreeNode[] = [
            {
                id: 'g1',
                label: 'Default',
                type: 'group',
                children: [
                    {id: 'mysql-1', label: 'shop mysql', type: 'connection', dbType: 'mysql'},
                    {id: 'redis-1', label: 'cache', type: 'connection', dbType: 'redis'},
                    {id: 'kafka-1', label: 'local kafka', type: 'connection', dbType: 'kafka'},
                ],
            },
        ]
        assert.deepEqual(listPublishSourceConnections(mixedTree), [
            {id: 'mysql-1', label: 'shop mysql', dbType: 'mysql', groupLabel: 'Default', databases: []},
        ])
    })

    it('presets kafka connection in default form', () => {
        const connections = listKafkaConnections(tree)
        const form = createDefaultKafkaTablePublishForm(connections, 'kafka-1')
        assert.equal(form.kafkaConnectionId, 'kafka-1')
    })

    it('validates source selection for kafka-side launch', () => {
        const sources = listPublishSourceConnections(tree)
        assert.equal(
            validateKafkaTablePublishSourceForm(
                {sourceConnectionId: '', sourceDatabase: '', tableName: ''},
                sources,
            ),
            'sourceConnectionRequired',
        )
        assert.deepEqual(
            buildKafkaTablePublishContextFromSource(sources, {
                sourceConnectionId: 'mysql-1',
                sourceDatabase: 'shop',
                tableName: 'orders',
            }),
            {
                sourceConnectionId: 'mysql-1',
                sourceConnectionLabel: 'shop mysql',
                sourceDatabase: 'shop',
                tableName: 'orders',
            },
        )
    })

    it('builds default topic from table name', () => {
        assert.equal(buildDefaultKafkaTopicForTable('orders'), 'stream_orders')
        assert.equal(buildDefaultKafkaTopicForTable(''), '')
    })

    it('builds publish request from table context', () => {
        const form = {
            ...createDefaultKafkaTablePublishForm(listKafkaConnections(tree)),
            topic: 'orders',
            keyColumn: 'id',
            maxMessages: 50,
            intervalMs: 1000,
            partition: '2',
        }
        assert.deepEqual(
            buildPublishTableToKafkaRequest(
                {
                    sourceConnectionId: 'mysql-1',
                    sourceConnectionLabel: 'shop mysql',
                    sourceDatabase: 'shop',
                    tableName: 'orders',
                },
                form,
            ),
            {
                sourceConnectionId: 'mysql-1',
                sourceDatabase: 'shop',
                tableName: 'orders',
                topic: 'orders',
                keyColumn: 'id',
                maxMessages: 50,
                intervalMs: 1000,
                partition: 2,
                fakeData: false,
                datagenSeed: null,
                datagenRowOffset: null,
            },
        )
    })

    it('builds fake-data publish request with datagen offsets', () => {
        const form = {
            ...createDefaultKafkaTablePublishForm(listKafkaConnections(tree)),
            topic: 'orders',
            dataSource: 'fake' as const,
            continuous: true,
        }
        assert.deepEqual(
            buildPublishTableToKafkaRequest(
                {
                    sourceConnectionId: 'mysql-1',
                    sourceConnectionLabel: 'shop mysql',
                    sourceDatabase: 'shop',
                    tableName: 'orders',
                },
                form,
                {datagenSeed: 42, datagenRowOffset: 100},
            ),
            {
                sourceConnectionId: 'mysql-1',
                sourceDatabase: 'shop',
                tableName: 'orders',
                topic: 'orders',
                keyColumn: null,
                maxMessages: 100,
                intervalMs: 0,
                partition: null,
                fakeData: true,
                datagenSeed: 42,
                datagenRowOffset: 100,
            },
        )
    })

    it('aggregates continuous publish batches and user stop', () => {
        const batches = [
            {messagesSent: 10, messagesFailed: 0, durationMs: 50, stopReason: 'LIMIT_REACHED', lastError: null, lastProduce: null},
            {messagesSent: 8, messagesFailed: 1, durationMs: 40, stopReason: 'PRODUCE_ERROR', lastError: 'boom', lastProduce: null},
        ]
        const stopped = aggregatePublishResults(batches, true)
        assert.equal(stopped.messagesSent, 18)
        assert.equal(stopped.messagesFailed, 1)
        assert.equal(stopped.durationMs, 90)
        assert.equal(stopped.stopReason, 'USER_STOPPED')
        assert.equal(stopped.lastError, 'boom')
    })
})
