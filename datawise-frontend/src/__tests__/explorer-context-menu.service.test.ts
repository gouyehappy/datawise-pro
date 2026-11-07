import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildExplorerGroupMenuItems,
    buildExplorerPinContextMenuItems,
    buildExplorerSshTerminalMenuItems,
} from '@/features/explorer/services/explorer-context-menu.service'
import type {ExplorerContextMenuDeps} from '@/features/explorer/services/explorer-context-menu.service'
import type {TreeNode} from '@/core/types'

function deps(overrides: Partial<ExplorerContextMenuDeps> = {}): ExplorerContextMenuDeps {
    return {
        t: (key: string) => key,
        explorer: {
            pooledConnectionIds: new Set(),
            connectionHealthById: {},
            loadingNodeIds: new Set(),
            tree: [],
            selectedNode: null,
            isNodePinned: () => false,
        } as unknown as ExplorerContextMenuDeps['explorer'],
        catalogStore: {items: []} as unknown as ExplorerContextMenuDeps['catalogStore'],
        teamStore: {teams: []} as unknown as ExplorerContextMenuDeps['teamStore'],
        ...overrides,
    }
}

function node(id: string, type: TreeNode['type']): TreeNode {
    return {id, label: id, type, children: []} as TreeNode
}

describe('explorer-context-menu.service', () => {
    it('builds ssh terminal menu items', () => {
        const items = buildExplorerSshTerminalMenuItems(deps())
        assert.ok(items.length > 0)
    })

    it('builds group menu items without selected connection', () => {
        const items = buildExplorerGroupMenuItems(node('g1', 'group'), deps())
        assert.ok(items.length > 0)
    })

    it('builds pinned menu items using explorer pin state', () => {
        const items = buildExplorerPinContextMenuItems(node('c1', 'connection'), [], deps())
        assert.ok(Array.isArray(items))
    })
})
