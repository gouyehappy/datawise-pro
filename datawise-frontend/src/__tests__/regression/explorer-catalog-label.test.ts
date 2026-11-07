import assert from 'node:assert/strict'
import {describe, test} from 'node:test'
import type {TreeNode} from '@/core/types'
import {
    isExplorerExtensionCatalogFolder,
    normalizeExplorerCatalogLabelKey,
    orderExplorerCatalogFolders,
    resolveExplorerCatalogLabel,
} from '@/features/explorer/services/explorer-catalog-label.service'

const t = (key: string) => {
    const map: Record<string, string> = {
        'explorer.treeCatalog.tables': '表',
        'explorer.treeCatalog.models': '模型',
        'explorer.treeCatalog.columns': '列',
        'explorer.treeCatalog.views': '视图',
    }
    return map[key] ?? key
}

describe('explorer-catalog-label', () => {
    test('normalizes known folder keys case-insensitively', () => {
        assert.equal(normalizeExplorerCatalogLabelKey('Tables'), 'tables')
        assert.equal(normalizeExplorerCatalogLabelKey('unknown'), null)
    })

    test('translates catalog folders and table sections', () => {
        const tablesFolder: TreeNode = {id: 'f1', label: 'tables', type: 'folder'}
        const columnsSection: TreeNode = {id: 'c1', label: 'columns', type: 'columns'}
        assert.equal(resolveExplorerCatalogLabel(tablesFolder, t), '表')
        assert.equal(resolveExplorerCatalogLabel(columnsSection, t), '列')
    })

    test('keeps user-defined folder labels unchanged', () => {
        const custom: TreeNode = {id: 'g1', label: '业务目录', type: 'folder'}
        assert.equal(resolveExplorerCatalogLabel(custom, t), '业务目录')
    })

    test('orders core folders before extension folders', () => {
        const children: TreeNode[] = [
            {id: '1', label: 'models', type: 'folder'},
            {id: '2', label: 'tables', type: 'folder'},
            {id: '3', label: 'ai', type: 'folder'},
            {id: '4', label: 'views', type: 'folder'},
            {id: '5', label: 'workspaces', type: 'folder'},
            {id: '6', label: 'triggers', type: 'folder'},
        ]
        assert.deepEqual(
            orderExplorerCatalogFolders(children).map((node) => node.label),
            ['tables', 'views', 'triggers', 'models', 'workspaces', 'ai'],
        )
    })

    test('marks models/workspaces/ai as extension folders', () => {
        assert.equal(isExplorerExtensionCatalogFolder({type: 'folder', label: 'models'}), true)
        assert.equal(isExplorerExtensionCatalogFolder({type: 'folder', label: 'workspaces'}), true)
        assert.equal(isExplorerExtensionCatalogFolder({type: 'folder', label: 'ai'}), true)
        assert.equal(isExplorerExtensionCatalogFolder({type: 'folder', label: 'tables'}), false)
        assert.equal(isExplorerExtensionCatalogFolder({type: 'folder', label: 'views'}), false)
    })
})
