import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode} from '@/core/types'
import {
    TABLES_FOLDER_LOADED_META,
    buildExplorerLoadChildKey,
    clearExplorerFolderLoadedIds,
    folderLoadedMeta,
    isExplorerFolderLoaded,
    isTablesFolderLoaded,
    markExplorerFolderLoaded,
    needsLazyLoad,
} from '@/features/explorer/services/explorer-lazy-load'

function folder(label: string, id: string, meta?: string, children?: TreeNode[]): TreeNode {
    return {id, label, type: 'folder', meta, children}
}

describe('explorer-lazy-load-perf', () => {
    it('buildExplorerLoadChildKey separates refresh and offset', () => {
        assert.equal(
            buildExplorerLoadChildKey('conn-1', 'node-a'),
            'conn-1:node-a:0:0',
        )
        assert.equal(
            buildExplorerLoadChildKey('conn-1', 'node-a', {offset: 500}),
            'conn-1:node-a:500:0',
        )
        assert.equal(
            buildExplorerLoadChildKey('conn-1', 'node-a', {refresh: true}),
            'conn-1:node-a:0:1',
        )
    })

    it('needsLazyLoad retries empty tables folder even after frontend marks loaded (BUG-004)', () => {
        clearExplorerFolderLoadedIds()
        const tables = folder('tables', 'folder-tables-1', undefined, [])
        markExplorerFolderLoaded(tables)
        assert.equal(isTablesFolderLoaded(tables), true)
        assert.equal(needsLazyLoad(tables, 'mysql'), true)
    })

    it('needsLazyLoad retries empty workspaces/views folders when marked loaded without children', () => {
        clearExplorerFolderLoadedIds()
        const workspaces = folder('workspaces', 'folder-ws-1', undefined, [])
        const views = folder('views', 'folder-views-1', undefined, [])
        markExplorerFolderLoaded(workspaces)
        markExplorerFolderLoaded(views)
        assert.equal(needsLazyLoad(workspaces, 'mysql'), true)
        assert.equal(needsLazyLoad(views, 'mysql'), true)
    })

    it('folderLoadedMeta normalizes label casing', () => {
        assert.equal(folderLoadedMeta('Tables'), 'tables:loaded')
        assert.equal(folderLoadedMeta('WORKSPACES'), 'workspaces:loaded')
    })

    it('needsLazyLoad retries tables folder stamped :loaded via meta when still empty (BUG-004)', () => {
        clearExplorerFolderLoadedIds()
        const tables = folder('tables', 'folder-tables-meta', TABLES_FOLDER_LOADED_META, [])
        assert.equal(isTablesFolderLoaded(tables), true)
        assert.equal(needsLazyLoad(tables, 'mysql'), true)
    })

    it('markExplorerFolderLoaded sets meta aligned with backend ExplorerTreeMarkers', () => {
        clearExplorerFolderLoadedIds()
        const workspaces = folder('workspaces', 'folder-ws-meta', undefined, [])
        markExplorerFolderLoaded(workspaces)
        assert.equal(workspaces.meta, 'workspaces:loaded')
        assert.equal(isExplorerFolderLoaded(workspaces), true)
    })

    it('needsLazyLoad still loads empty tables folder without loaded marker', () => {
        clearExplorerFolderLoadedIds()
        const tables = folder('tables', 'folder-tables-2', undefined, [])
        assert.equal(needsLazyLoad(tables, 'mysql'), true)
    })
})
