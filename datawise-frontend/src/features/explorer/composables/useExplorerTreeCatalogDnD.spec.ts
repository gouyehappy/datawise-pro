import {describe, expect, it, vi} from 'vitest'
import type {TreeNode} from '@/core/types'
import {useExplorerTreeCatalogDnD} from '@/features/explorer/composables/useExplorerTreeCatalogDnD'

vi.mock('@/features/auth/services/feature-permission.service', () => ({
    canMutateConnectionCatalog: () => true,
}))

vi.mock('@/features/explorer/services/explorer-move-connection.service', () => ({
    canMoveConnectionToGroup: () => true,
}))

function connectionNode(overrides: Partial<TreeNode> = {}): TreeNode {
    return {
        id: 'conn-1',
        label: 'MySQL',
        type: 'connection',
        children: [],
        ...overrides,
    } as TreeNode
}

describe('useExplorerTreeCatalogDnD', () => {
    it('performMoveConnection moves via explorer and toasts success', async () => {
        const moveConnection = vi.fn().mockResolvedValue(undefined)
        const showSuccessToast = vi.fn()
        const connection = connectionNode()
        const group = {id: 'group-1', label: 'Prod', type: 'group', children: []} as TreeNode

        const dnd = useExplorerTreeCatalogDnD({
            t: ((key: string, params?: Record<string, string>) =>
                params ? `${key}:${JSON.stringify(params)}` : key) as never,
            explorer: {
                tree: [group, connection],
                findNode: (id: string) => (id === 'conn-1' ? connection : id === 'group-1' ? group : null),
                moveConnection,
            } as never,
            layout: {
                showSuccessToast,
                showErrorToast: vi.fn(),
            } as never,
            auth: {isGuest: false} as never,
            projectStore: {} as never,
        })

        await dnd.performMoveConnection('conn-1', 'group-1')

        expect(moveConnection).toHaveBeenCalledWith('conn-1', 'group-1')
        expect(showSuccessToast).toHaveBeenCalled()
        expect(dnd.connectionDragEnabled.value).toBe(true)
    })
})
