import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildAiTaggedScopeFlatNodes,
    buildAiTaggedScopeTree,
} from '@/features/ai/tag/services/ai-tagged-scope.service'
import type {AiTaggedScopeGroup} from '@/features/ai/tag/types/ai-table-tag.types'

function group(partial: Partial<AiTaggedScopeGroup> & Pick<AiTaggedScopeGroup, 'key' | 'connectionId' | 'database' | 'tables'>): AiTaggedScopeGroup {
    return {
        connectionLabel: partial.connectionLabel ?? partial.connectionId,
        databaseLabel: partial.databaseLabel ?? partial.database,
        dbType: partial.dbType ?? 'mysql',
        groupLabel: partial.groupLabel ?? '',
        ...partial,
    }
}

describe('ai-tagged-scope.service', () => {
    it('buildAiTaggedScopeTree groups by connection then database', () => {
        const tree = buildAiTaggedScopeTree([
            group({
                key: 'c1|shop',
                connectionId: 'c1',
                connectionLabel: 'mysql shop',
                database: 'shop',
                tables: ['orders'],
            }),
            group({
                key: 'c1|crm',
                connectionId: 'c1',
                connectionLabel: 'mysql shop',
                database: 'crm',
                tables: ['accounts'],
            }),
        ])

        assert.equal(tree.length, 1)
        assert.equal(tree[0].type, 'connection')
        assert.equal(tree[0].children?.length, 2)
        const databases = tree[0].children ?? []
        const shop = databases.find((node) => node.label === 'shop')
        const crm = databases.find((node) => node.label === 'crm')
        assert.equal(shop?.type, 'database')
        assert.equal(crm?.type, 'database')
        assert.equal(shop?.children?.[0].label, 'orders')
        assert.equal(crm?.children?.[0].label, 'accounts')
    })

    it('buildAiTaggedScopeFlatNodes filters by search and keeps table target ids', () => {
        const groups = [
            group({
                key: 'c1|shop',
                connectionId: 'c1',
                connectionLabel: 'mysql shop',
                database: 'shop',
                tables: ['orders', 'products'],
            }),
        ]

        const flat = buildAiTaggedScopeFlatNodes(groups, 'orders', new Set())
        const tables = flat.filter(({node}) => node.type === 'table')

        assert.equal(tables.length, 1)
        assert.equal(tables[0].node.label, 'orders')
        assert.equal(tables[0].node.id, 'c1:shop:orders')
    })
})
