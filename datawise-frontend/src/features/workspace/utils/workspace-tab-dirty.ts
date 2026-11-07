import type {WorkspaceTab, WorkspaceTabType} from '@/core/types'
import {isConsoleTabDirty} from '@/features/workspace/services/console-tab-dirty'

/** Tab types that can show an unsaved dot and participate in close/save prompts. */
export const WORKSPACE_DIRTY_TAB_TYPES = [
    'console',
    'view_model_editor',
    'ssh-script-record',
    'local-text',
] as const satisfies readonly WorkspaceTabType[]

export type WorkspaceDirtyTabType = (typeof WORKSPACE_DIRTY_TAB_TYPES)[number]

export function isWorkspaceDirtyTabType(type: WorkspaceTabType): type is WorkspaceDirtyTabType {
    return (WORKSPACE_DIRTY_TAB_TYPES as readonly string[]).includes(type)
}

/** Whether a workspace tab has unsaved content (by tab type). */
export function isWorkspaceTabDirty(
    tab: WorkspaceTab,
    sshScriptDirtyByTabId: Record<string, boolean> = {},
): boolean {
    if (tab.type === 'view_model_editor') {
        return (tab.viewModelSql ?? '').trim() !== (tab.viewModelSavedSql ?? '').trim()
    }
    if (tab.type === 'ssh-script-record') {
        return !!sshScriptDirtyByTabId[tab.id]
    }
    if (tab.type === 'local-text') {
        return (tab.sql ?? '') !== (tab.savedContent ?? '')
    }
    return isConsoleTabDirty(tab)
}

/** Tab types that support the unified save-dirty path. */
export function canSaveWorkspaceTab(tab: WorkspaceTab): boolean {
    return isWorkspaceDirtyTabType(tab.type)
}
