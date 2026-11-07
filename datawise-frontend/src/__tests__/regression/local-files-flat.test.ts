import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    findLocalFileFlatNodeIndex,
    flattenLocalFileTree,
} from '@/features/local-files/services/local-files-flat'
import type {LocalFileTreeNode} from '@/features/local-files/stores/local-files-store'

function file(partial: Partial<LocalFileTreeNode> & Pick<LocalFileTreeNode, 'id' | 'path' | 'name'>): LocalFileTreeNode {
    return {
        isDirectory: false,
        size: 0,
        mtimeMs: 0,
        loaded: true,
        ...partial,
    }
}

function dir(
    partial: Partial<LocalFileTreeNode> & Pick<LocalFileTreeNode, 'id' | 'path' | 'name'>,
    children: LocalFileTreeNode[] = [],
): LocalFileTreeNode {
    return {
        isDirectory: true,
        size: 0,
        mtimeMs: 0,
        loaded: true,
        children,
        ...partial,
    }
}

describe('local-files-flat', () => {
    it('flattens expanded nodes with depth', () => {
        const tree = [
            dir({id: 'root', path: '/ws', name: 'ws'}, [
                file({id: 'a', path: '/ws/a.sql', name: 'a.sql'}),
                dir({id: 'sub', path: '/ws/sub', name: 'sub'}, [
                    file({id: 'b', path: '/ws/sub/b.md', name: 'b.md'}),
                ]),
            ]),
        ]
        const flat = flattenLocalFileTree(tree, new Set(['root', 'sub']), null, null)
        assert.deepEqual(
            flat.map((entry) => [entry.node.id, entry.depth, entry.node.kind]),
            [
                ['root', 0, 'node'],
                ['a', 1, 'node'],
                ['sub', 1, 'node'],
                ['b', 2, 'node'],
            ],
        )
    })

    it('inserts empty-folder and draft rows', () => {
        const empty = dir({id: 'empty', path: '/ws/empty', name: 'empty'})
        const flatEmpty = flattenLocalFileTree([empty], new Set(['empty']), null, null)
        assert.equal(flatEmpty.length, 2)
        assert.equal(flatEmpty[1].node.kind, 'empty')

        const flatDraft = flattenLocalFileTree([empty], new Set(['empty']), null, {
            mode: 'create-file',
            parentPath: '/ws/empty',
            depth: 1,
            value: 'x.txt',
        })
        assert.equal(flatDraft.length, 2)
        assert.equal(flatDraft[1].node.kind, 'draft')
        assert.equal(flatDraft[1].depth, 1)
    })

    it('findLocalFileFlatNodeIndex skips synthetics', () => {
        const tree = [dir({id: 'empty', path: '/ws/empty', name: 'empty'})]
        const flat = flattenLocalFileTree(tree, new Set(['empty']), null, null)
        assert.equal(findLocalFileFlatNodeIndex(flat, 'empty'), 0)
        assert.equal(findLocalFileFlatNodeIndex(flat, 'empty:empty'), -1)
    })
})
