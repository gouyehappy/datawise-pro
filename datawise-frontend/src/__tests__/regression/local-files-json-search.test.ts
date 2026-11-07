import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {formatLocalJson} from '@/features/local-files/services/local-files-json'
import {collectLocalFilesSearchVisibility} from '@/features/local-files/services/local-files-search'
import type {LocalFileTreeNode} from '@/features/local-files/stores/local-files-store'

describe('formatLocalJson', () => {
    it('pretty-prints compact json', () => {
        const out = formatLocalJson('{"a":1,"b":[2]}')
        assert.equal(out, '{\n  "a": 1,\n  "b": [\n    2\n  ]\n}\n')
    })

    it('rejects invalid json', () => {
        assert.throws(() => formatLocalJson('{a'), SyntaxError)
        assert.throws(() => formatLocalJson('   '), /empty_json/)
    })
})

describe('collectLocalFilesSearchVisibility content hits', () => {
    const tree: LocalFileTreeNode[] = [
        {
            id: 'root',
            path: '/ws',
            name: 'ws',
            isDirectory: true,
            size: 0,
            mtimeMs: 0,
            loaded: true,
            children: [
                {
                    id: 'a',
                    path: '/ws/a.sql',
                    name: 'a.sql',
                    isDirectory: false,
                    size: 1,
                    mtimeMs: 0,
                    loaded: true,
                },
                {
                    id: 'b',
                    path: '/ws/b.sql',
                    name: 'other.sql',
                    isDirectory: false,
                    size: 1,
                    mtimeMs: 0,
                    loaded: true,
                },
            ],
        },
    ]

    it('includes files matched by contentHitIds even when name misses', () => {
        const vis = collectLocalFilesSearchVisibility(tree, 'select', 'all', new Set(['b']))
        assert.ok(vis)
        assert.equal(vis!.visibleIds.has('b'), true)
        assert.equal(vis!.visibleIds.has('a'), false)
        assert.equal(vis!.forceExpandIds.has('root'), true)
    })
})
