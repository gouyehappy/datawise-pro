import {useWorkspaceActions} from '@/features/layout/composables/useWorkspaceActions'

export type {
    WorkspaceConfirmRequest,
    WorkspacePromptRequest,
} from '@/features/layout/composables/useWorkspaceActions'

export function useWorkspaceSwitcher() {
    return useWorkspaceActions()
}
