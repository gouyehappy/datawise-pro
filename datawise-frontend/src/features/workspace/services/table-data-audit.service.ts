import type {TableDataChangeAuditEntry} from '@/shared/api/types'

export function summarizeAuditEntryChanges(entry: TableDataChangeAuditEntry): string {
    if (entry.operation !== 'UPDATE') return ''
    const before = entry.beforeRow ?? {}
    const after = entry.afterRow ?? {}
    const changed: string[] = []
    for (const [column, afterValue] of Object.entries(after)) {
        if (before[column] !== afterValue) {
            changed.push(column)
        }
    }
    if (!changed.length) return ''
    const preview = changed.slice(0, 3).join(', ')
    return changed.length > 3 ? `${preview} +${changed.length - 3}` : preview
}
