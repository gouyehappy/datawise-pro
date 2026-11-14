import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {useExplorerTreeInlineEdit} from '@/features/explorer/composables/useExplorerTreeInlineEdit'

vi.mock('@/features/auth/services/feature-permission.service', () => ({
    canMutateConnectionCatalog: () => true,
}))

vi.mock('@/features/project/services/project-explorer-files', () => ({
    GROUP_DRAFT_ID: 'group-draft',
    PROJECT_FILES_DRAFT_ID: 'project-files-draft',
    removeProjectFilesDraft: vi.fn(),
    ensureProjectFilesEmptyHint: vi.fn(),
}))

describe('useExplorerTreeInlineEdit', () => {
    const tree: unknown[] = []
    const explorer = {
        tree,
        findNode: vi.fn(),
        touchTree: vi.fn(),
        selectNode: vi.fn(),
        expandAndLoad: vi.fn(),
    }
    const layout = {
        showErrorToast: vi.fn(),
        showSuccessToast: vi.fn(),
    }

    beforeEach(() => {
        tree.length = 0
        vi.clearAllMocks()
    })

    it('beginCreateRootGroup sets treeInline kind create-root-group; cancel clears it', async () => {
        const inline = useExplorerTreeInlineEdit({
            t: ((key: string) => key) as never,
            explorer: explorer as never,
            workspace: {} as never,
            layout: layout as never,
            auth: {isGuest: false} as never,
            findConnectionId: () => undefined,
            findConnectionLabel: () => undefined,
            pendingGroupNode: ref(null),
            pendingSqlFileNode: ref(null),
        })

        await inline.beginCreateRootGroup()

        expect(inline.treeInline.value?.kind).toBe('create-root-group')
        expect(inline.treeInline.value?.nodeId).toBe('group-draft')
        expect(explorer.selectNode).toHaveBeenCalledWith('group-draft')

        await inline.cancelTreeInlineEdit()

        expect(inline.treeInline.value).toBeNull()
    })
})
