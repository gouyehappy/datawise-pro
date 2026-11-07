import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {ref} from 'vue'
import {useAiTaggedScopeTree} from '@/features/ai/datasource/composables/useAiTaggedScopeTree'
import type {AiTaggedScopeGroup} from '@/features/ai/tag/types/ai-table-tag.types'

function sampleGroups(): AiTaggedScopeGroup[] {
    return [
        {
            key: 'conn-1|shop',
            connectionId: 'conn-1',
            connectionLabel: 'mysql-main',
            database: 'shop',
            databaseLabel: 'shop',
            dbType: 'mysql',
            groupLabel: 'default',
            tables: ['orders', 'users'],
        },
        {
            key: 'conn-1|analytics',
            connectionId: 'conn-1',
            connectionLabel: 'mysql-main',
            database: 'analytics',
            databaseLabel: 'analytics',
            dbType: 'mysql',
            groupLabel: 'default',
            tables: ['events'],
        },
    ]
}

describe('useAiTaggedScopeTree', () => {
    it('checks all child tables when toggling a connection node', () => {
        const groups = ref(sampleGroups())
        const search = ref('')
        const selectedIds = ref<string[]>([])
        const tree = useAiTaggedScopeTree(groups, search, selectedIds)
        const connectionNode = tree.flatNodes.value.find(({node}) => node.id === 'aitag-c:conn-1')?.node

        assert.ok(connectionNode)
        tree.toggleCheck(connectionNode)

        assert.deepEqual(
            selectedIds.value.sort(),
            [
                'conn-1:analytics:events',
                'conn-1:shop:orders',
                'conn-1:shop:users',
            ].sort(),
        )
        assert.equal(tree.isChecked(connectionNode), true)
    })

    it('checks all child tables when toggling a database node', () => {
        const groups = ref(sampleGroups())
        const search = ref('')
        const selectedIds = ref<string[]>([])
        const tree = useAiTaggedScopeTree(groups, search, selectedIds)
        const dbNode = tree.flatNodes.value.find(({node}) => node.id === 'aitag-d:conn-1:shop')?.node

        assert.ok(dbNode)
        tree.toggleCheck(dbNode)

        assert.deepEqual(selectedIds.value.sort(), ['conn-1:shop:orders', 'conn-1:shop:users'].sort())
        assert.equal(tree.isChecked(dbNode), true)
    })
})
