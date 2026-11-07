import {SHORTCUT_DEFINITIONS} from '@/core/shortcuts/definitions'
import type {ShortcutActionId, ShortcutDefinition} from '@/core/shortcuts/types'
import {
    isGlobalShortcutDefinition,
    isLocalShortcutDefinition,
} from '@datawise/shortcuts'

export {isGlobalShortcutDefinition, isLocalShortcutDefinition}

export const LOCAL_SQL_EDITOR_SHORTCUT_IDS = [
    'workspace.runSql',
    'workspace.selectFirstRows',
    'workspace.countRows',
    'workspace.saveConsole',
    'workspace.aiPrompt',
] as const satisfies readonly ShortcutActionId[]

export type LocalSqlEditorShortcutId = (typeof LOCAL_SQL_EDITOR_SHORTCUT_IDS)[number]

export function isLocalShortcutId(id: ShortcutActionId): id is LocalSqlEditorShortcutId {
    return (LOCAL_SQL_EDITOR_SHORTCUT_IDS as readonly ShortcutActionId[]).includes(id)
}

export const GLOBAL_SHORTCUT_DEFINITIONS = SHORTCUT_DEFINITIONS.filter(isGlobalShortcutDefinition)

export const LOCAL_SHORTCUT_DEFINITIONS = SHORTCUT_DEFINITIONS.filter(isLocalShortcutDefinition)

export const GLOBAL_SHORTCUT_ACTION_IDS = GLOBAL_SHORTCUT_DEFINITIONS.map((def) => def.id)

/** 输入框 / Monaco 内仍应响应的全局快捷键（不含局部编辑器动作） */
export const EDITABLE_TARGET_GLOBAL_SHORTCUT_IDS: ShortcutActionId[] = [
    'explorer.search',
    'workspace.newConsole',
    'app.zoomIn',
    'app.zoomOut',
    'app.zoomReset',
    'app.lockScreen',
]
