import type {WorkspaceTab} from '@/core/types'

/** SQL 控制台 Tab 内容相对上次保存是否有改动 */
export function isConsoleTabDirty(tab: WorkspaceTab): boolean {
    if (tab.type !== 'console') return false
    const saved = tab.savedSql ?? ''
    return (tab.sql ?? '') !== saved
}
