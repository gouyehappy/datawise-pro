import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode} from '@/core/types'
import {buildExplorerNodeInfo} from '@/features/explorer/services/explorer-node-info.service'

function node(partial: Partial<TreeNode> & Pick<TreeNode, 'id' | 'label' | 'type'>): TreeNode {
    return {...partial}
}

describe('explorer node info', () => {
    const tree: TreeNode[] = [
        {
            id: 'conn-1',
            label: 'dev',
            type: 'connection',
            dbType: 'mysql',
            children: [
                {
                    id: 'db-1',
                    label: 'admin_db',
                    type: 'database',
                    children: [
                        {
                            id: 'folder-tables',
                            label: 'tables',
                            type: 'folder',
                            children: [
                                {
                                    id: 'table-1',
                                    label: 'cdp_segment',
                                    type: 'table',
                                    comment: 'CDP分群表',
                                    children: [
                                        {
                                            id: 'cols',
                                            label: 'columns',
                                            type: 'columns',
                                            children: [
                                                {
                                                    id: 'col-id',
                                                    label: 'id',
                                                    type: 'primary_key',
                                                    meta: 'bigint · pk',
                                                    comment: '主键ID',
                                                },
                                            ],
                                        },
                                        {
                                            id: 'keys',
                                            label: 'keys',
                                            type: 'keys',
                                            children: [
                                                {
                                                    id: 'pk',
                                                    label: 'PRIMARY',
                                                    type: 'primary_key',
                                                    meta: 'id',
                                                },
                                            ],
                                        },
                                        {
                                            id: 'idx',
                                            label: 'indexes',
                                            type: 'indexes',
                                            children: [
                                                {
                                                    id: 'ix-1',
                                                    label: 'idx_name',
                                                    type: 'index',
                                                    meta: 'unique · name',
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ]

    it('builds database info', () => {
        const info = buildExplorerNodeInfo(tree[0].children![0], tree)
        assert.equal(info.kind, 'database')
        assert.equal(info.title, 'admin_db')
        assert.equal(info.fields.find((f) => f.key === 'connection')?.value, 'dev')
    })

    it('builds table info with columns', () => {
        const table = tree[0].children![0].children![0].children![0]
        const info = buildExplorerNodeInfo(table, tree)
        assert.equal(info.kind, 'table')
        assert.equal(info.listItems.length, 1)
        assert.equal(info.listItems[0].name, 'id')
    })

    it('builds column info', () => {
        const column = tree[0].children![0].children![0].children![0].children![0].children![0]
        const info = buildExplorerNodeInfo(column, tree)
        assert.equal(info.kind, 'primary_key')
        assert.equal(info.fields.find((f) => f.key === 'dataType')?.value, 'bigint')
    })

    it('builds index info', () => {
        const index = tree[0].children![0].children![0].children![0].children![2].children![0]
        const info = buildExplorerNodeInfo(index, tree)
        assert.equal(info.kind, 'index')
        assert.equal(info.fields.find((f) => f.key === 'indexType')?.value, 'unique')
    })
})
