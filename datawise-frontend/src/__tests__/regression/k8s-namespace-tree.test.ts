import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildK8sNamespaceTreeNodes,
    parseK8sNamespaceNodeId,
    k8sNamespaceTreeNodeId,
} from '@/features/explorer/services/k8s-namespace-tree.service'

describe('k8s-namespace-tree', () => {
    it('builds unique namespace nodes and skips blanks', () => {
        const nodes = buildK8sNamespaceTreeNodes('conn-1', [
            {name: 'default', status: 'Active', creationTimestamp: null},
            {name: 'kube-system', status: 'Active', creationTimestamp: null},
            {name: 'default', status: 'Active', creationTimestamp: null},
            {name: '  ', status: 'Active', creationTimestamp: null},
            {name: null, status: null, creationTimestamp: null},
        ])
        assert.deepEqual(
            nodes.map((item) => ({id: item.id, label: item.label, meta: item.meta, comment: item.comment})),
            [
                {
                    id: k8sNamespaceTreeNodeId('conn-1', 'default'),
                    label: 'default',
                    meta: 'default',
                    comment: 'Active',
                },
                {
                    id: k8sNamespaceTreeNodeId('conn-1', 'kube-system'),
                    label: 'kube-system',
                    meta: 'kube-system',
                    comment: 'Active',
                },
            ],
        )
        assert.equal(parseK8sNamespaceNodeId(nodes[0]!), 'default')
        assert.equal(parseK8sNamespaceNodeId({type: 'k8s-namespace', meta: ''}), null)
        assert.equal(parseK8sNamespaceNodeId({type: 'k8s-feature', meta: 'default'}), null)
    })
})
