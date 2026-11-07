import assert from 'node:assert/strict'
import {describe, it, beforeEach} from 'node:test'
import {
    __setExplorerUiCatalogForTests,
    ensureCatalogFeatureChildren,
} from '@/features/explorer/services/explorer-ui-catalog.service'
import {parseKafkaFeatureId} from '@/features/explorer/services/kafka-feature-tree.service'

describe('kafka-feature-tree.service', () => {
    beforeEach(() => {
        __setExplorerUiCatalogForTests(null)
    })

    it('injects catalog children for kafka connection', () => {
        const connection = {id: 'kafka-1', label: 'local', type: 'connection' as const, dbType: 'kafka' as const}
        ensureCatalogFeatureChildren(connection)
        assert.equal(connection.children?.length, 2)
        assert.deepEqual(connection.children?.[0], {
            id: 'kafka-1:kafka:feature:workbench',
            label: 'workbench',
            type: 'kafka-feature',
            dbType: 'kafka',
            meta: 'workbench',
        })
        assert.equal(connection.children?.[1].meta, 'table-publish')
    })

    it('replaces retired topic and group rows with workbench', () => {
        const connection = {
            id: 'kafka-1',
            label: 'local',
            type: 'connection' as const,
            dbType: 'kafka' as const,
            children: [
                {
                    id: 'kafka-1:kafka:feature:topics',
                    label: 'topics',
                    type: 'kafka-feature' as const,
                    dbType: 'kafka' as const,
                    meta: 'topics',
                },
            ],
        }
        ensureCatalogFeatureChildren(connection)
        assert.equal(connection.children?.length, 2)
        assert.ok(connection.children?.some((child) => child.meta === 'workbench'))
        assert.ok(connection.children?.some((child) => child.meta === 'table-publish'))
        assert.equal(connection.children?.some((child) => child.meta === 'topics'), false)
    })

    it('parses feature id from node meta', () => {
        assert.equal(parseKafkaFeatureId({type: 'kafka-feature', meta: 'workbench'}), 'workbench')
        assert.equal(parseKafkaFeatureId({type: 'kafka-feature', meta: 'topics'}), 'topics')
        assert.equal(parseKafkaFeatureId({type: 'kafka-feature', meta: 'consumer-groups'}), 'consumer-groups')
        assert.equal(parseKafkaFeatureId({type: 'kafka-feature', meta: 'table-publish'}), 'table-publish')
        assert.equal(parseKafkaFeatureId({type: 'connection', meta: 'topics'}), null)
    })
})
