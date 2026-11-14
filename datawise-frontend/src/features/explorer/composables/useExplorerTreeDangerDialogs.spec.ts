import {describe, expect, it, vi} from 'vitest'
import type {TreeNode} from '@/core/types'
import {useExplorerTreeDangerDialogs} from '@/features/explorer/composables/useExplorerTreeDangerDialogs'

function connectionNode(overrides: Partial<TreeNode> = {}): TreeNode {
    return {
        id: 'conn-1',
        label: 'MySQL',
        type: 'connection',
        children: [],
        ...overrides,
    } as TreeNode
}

describe('useExplorerTreeDangerDialogs', () => {
    it('confirmDeleteCatalogNode calls explorer.deleteNode', async () => {
        const deleteNode = vi.fn().mockResolvedValue(undefined)
        const showSuccessToast = vi.fn()
        const showErrorToast = vi.fn()
        const node = connectionNode()

        const dialogs = useExplorerTreeDangerDialogs({
            t: ((key: string) => key) as never,
            explorer: {
                deleteNode,
            } as never,
            workspace: {} as never,
            layout: {
                showSuccessToast,
                showErrorToast,
            } as never,
            findConnectionId: () => 'conn-1',
            deleteSshScriptRecordFromNode: vi.fn(),
            renameSshScriptRecordFromNode: vi.fn(),
        })

        dialogs.pendingDeleteCatalogNode.value = node
        dialogs.showDeleteCatalogDialog.value = true

        await dialogs.confirmDeleteCatalogNode()

        expect(deleteNode).toHaveBeenCalledWith('conn-1')
        expect(showSuccessToast).toHaveBeenCalled()
        expect(dialogs.pendingDeleteCatalogNode.value).toBeNull()
        expect(dialogs.showDeleteCatalogDialog.value).toBe(false)
    })
})
