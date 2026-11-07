import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildNacosNamespaceTreeNodes,
    nacosNamespaceTreeNodeId,
    parseNacosNamespaceNodeId,
} from '@/features/explorer/services/nacos-namespace-tree.service'

describe('nacos-namespace-tree', () => {
    it('builds public plus filtered namespaces', () => {
        const nodes = buildNacosNamespaceTreeNodes(
            'conn-1',
            [
                {namespace: 'dev', namespaceShowName: 'Development'},
                {namespace: 'prod', namespaceShowName: 'prod'},
                {namespace: '', namespaceShowName: 'public'},
            ],
            ['', 'dev'],
        )
        assert.deepEqual(
            nodes.map((item) => ({id: item.id, label: item.label, meta: item.meta})),
            [
                {id: nacosNamespaceTreeNodeId('conn-1', ''), label: 'public', meta: 'public'},
                {id: nacosNamespaceTreeNodeId('conn-1', 'dev'), label: 'Development', meta: 'dev'},
            ],
        )
        assert.equal(parseNacosNamespaceNodeId(nodes[0]!), '')
        assert.equal(parseNacosNamespaceNodeId(nodes[1]!), 'dev')
    })

    it('omits public when allow-list excludes it', () => {
        const nodes = buildNacosNamespaceTreeNodes(
            'c',
            [{namespace: 'only', namespaceShowName: 'only'}],
            ['only'],
        )
        assert.equal(nodes.length, 1)
        assert.equal(nodes[0]!.meta, 'only')
    })
})
