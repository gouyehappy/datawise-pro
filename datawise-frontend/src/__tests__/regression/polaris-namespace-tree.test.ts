import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildPolarisNamespaceTreeNodes,
    parsePolarisNamespaceNodeId,
    polarisNamespaceTreeNodeId,
} from '@/features/explorer/services/polaris-namespace-tree.service'

describe('polaris-namespace-tree', () => {
    it('builds unique namespace nodes and skips blanks', () => {
        const nodes = buildPolarisNamespaceTreeNodes('conn-1', [
            {name: 'default', comment: 'builtin'},
            {name: 'Production', comment: 'Production'},
            {name: 'default', comment: 'dup'},
            {name: '  ', comment: 'blank'},
            {name: null},
        ])
        assert.deepEqual(
            nodes.map((item) => ({id: item.id, label: item.label, meta: item.meta, comment: item.comment})),
            [
                {
                    id: polarisNamespaceTreeNodeId('conn-1', 'default'),
                    label: 'default',
                    meta: 'default',
                    comment: 'builtin',
                },
                {
                    id: polarisNamespaceTreeNodeId('conn-1', 'Production'),
                    label: 'Production',
                    meta: 'Production',
                    comment: undefined,
                },
            ],
        )
        assert.equal(parsePolarisNamespaceNodeId(nodes[0]!), 'default')
        assert.equal(parsePolarisNamespaceNodeId({type: 'polaris-namespace', meta: ''}), null)
        assert.equal(parsePolarisNamespaceNodeId({type: 'polaris-feature', meta: 'default'}), null)
    })
})
