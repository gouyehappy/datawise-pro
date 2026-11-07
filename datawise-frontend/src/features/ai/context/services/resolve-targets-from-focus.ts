import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'
import type {WorkbenchContextFocus} from '@/features/ai/context/types/workbench-context.types'

/**
 * Map live workbench focus onto AI tagged-scope / database targets.
 * Prefers table → database → any target on the connection.
 */
export function resolveTargetIdsFromWorkbenchFocus(
    allTargets: AiDatabaseTarget[],
    focus: WorkbenchContextFocus | null | undefined,
): string[] {
    if (!focus?.connectionId || !allTargets.length) return []

    const connectionId = focus.connectionId
    const database = focus.database?.trim()
    const objectName = focus.objectName?.trim()
    const sameConnection = allTargets.filter((t) => t.connectionId === connectionId)
    if (!sameConnection.length) return []

    const dbMatch = (t: AiDatabaseTarget) =>
        !database
        || t.databaseLabel === database
        || t.databaseId === database

    if (objectName && (focus.objectKind === 'table' || focus.objectKind === 'view' || !focus.objectKind)) {
        const table = sameConnection.find(
            (t) => t.level === 'table' && t.tableLabel === objectName && dbMatch(t),
        )
        if (table) return [table.id]
    }

    if (database) {
        const dbTarget = sameConnection.find((t) => t.level === 'database' && dbMatch(t))
        if (dbTarget) return [dbTarget.id]
        const anyInDb = sameConnection.find((t) => dbMatch(t))
        if (anyInDb) return [anyInDb.id]
    }

    const preferred =
        sameConnection.find((t) => t.level === 'database')
        ?? sameConnection.find((t) => t.level === 'connection')
        ?? sameConnection[0]
    return preferred ? [preferred.id] : []
}

export function describeWorkbenchFocusSelection(focus: WorkbenchContextFocus): string {
    const parts: string[] = []
    if (focus.connectionName || focus.connectionId) {
        parts.push(focus.connectionName || focus.connectionId || '')
    }
    if (focus.dialect && !focus.connectionName && !focus.connectionId) {
        parts.push(focus.dialect)
    }
    if (focus.database) parts.push(focus.database)
    if (focus.resourcePath) {
        parts.push(focus.resourcePath)
    } else if (focus.objectName) {
        const kind = focus.objectKind && focus.objectKind !== 'other' ? `${focus.objectKind} ` : ''
        parts.push(`${kind}${focus.objectName}`.trim())
    } else if (focus.pluginId) {
        parts.push(focus.pluginId)
    }
    return parts.filter(Boolean).join(' · ')
}

/**
 * Focus is present for DB *and* non-DB work surfaces:
 * connection tabs (Redis/SSH/Kafka/…), local Markdown/text, or plugin workbench.
 * SQL tagged-scope resolution may still be empty when there is no connectionId.
 */
export function hasWorkbenchFocus(focus: WorkbenchContextFocus | null | undefined): boolean {
    if (!focus) return false
    if (focus.connectionId) return true
    if (focus.resourcePath) return true
    if (focus.pluginId || focus.workbenchId) return true
    if (focus.objectName) return true
    return false
}
