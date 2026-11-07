import type {TreeNode} from '@/core/types'
import {findNodeById, walkTree} from '@/core/utils/tree'
import {
    extractConnectionsFromTree,
    type ExtractedConnection,
} from '@/features/explorer/utils/tree-targets'
import type {AiDatabaseGroup, AiDatabaseTarget, AiTargetLevel} from '@/shared/api/ai.types'

export type {AiDatabaseGroup, AiDatabaseTarget, AiTargetLevel}

export function extractDatabaseTargets(tree: TreeNode[]): AiDatabaseTarget[] {
    const targets: AiDatabaseTarget[] = []

    for (const conn of extractConnectionsFromTree(tree)) {
        if (!conn.databases.length) {
            targets.push(buildConnectionOnlyTarget(conn))
            continue
        }

        for (const database of conn.databases) {
            targets.push(buildDatabaseTarget(conn, database))

            const dbNode = findNodeById(tree, database.id)
            if (!dbNode) continue

            for (const table of collectTablesUnderDatabase(dbNode)) {
                targets.push(buildTableTarget(conn, database, table))
            }
        }
    }

    return targets
}

function collectTablesUnderDatabase(dbNode: TreeNode): { id: string; label: string }[] {
    const tables: { id: string; label: string }[] = []
    walkTree(dbNode.children ?? [], (node) => {
        if (node.type === 'table') {
            tables.push({id: node.id, label: node.label})
        }
    })
    return tables
}

function buildDatabaseTarget(
    conn: ExtractedConnection,
    database: { id: string; label: string },
): AiDatabaseTarget {
    return {
        id: `${conn.id}:${database.id}`,
        connectionId: conn.id,
        connectionLabel: conn.label,
        databaseId: database.id,
        databaseLabel: database.label,
        level: 'database',
        dbType: conn.dbType,
        groupLabel: conn.groupLabel,
    }
}

function buildTableTarget(
    conn: ExtractedConnection,
    database: { id: string; label: string },
    table: { id: string; label: string },
): AiDatabaseTarget {
    return {
        id: `${conn.id}:${database.id}:${table.id}`,
        connectionId: conn.id,
        connectionLabel: conn.label,
        databaseId: database.id,
        databaseLabel: database.label,
        tableId: table.id,
        tableLabel: table.label,
        level: 'table',
        dbType: conn.dbType,
        groupLabel: conn.groupLabel,
    }
}

function buildConnectionOnlyTarget(conn: ExtractedConnection): AiDatabaseTarget {
    return {
        id: `${conn.id}:__conn__`,
        connectionId: conn.id,
        connectionLabel: conn.label,
        databaseId: '__conn__',
        databaseLabel: conn.label,
        level: 'connection',
        dbType: conn.dbType,
        groupLabel: conn.groupLabel,
    }
}

export function groupDatabaseTargets(targets: AiDatabaseTarget[]): AiDatabaseGroup[] {
    const map = new Map<string, AiDatabaseTarget[]>()

    for (const target of targets) {
        const list = map.get(target.groupLabel) ?? []
        list.push(target)
        map.set(target.groupLabel, list)
    }

    return Array.from(map.entries()).map(([groupLabel, groupTargets]) => ({
        groupLabel,
        targets: groupTargets,
    }))
}

export function resolveTargetIdFromNode(tree: TreeNode[], nodeId: string | null): string | null {
    if (!nodeId) return null

    const node = findNodeById(tree, nodeId)
    if (!node) return null

    if (node.type === 'connection') {
        return `${node.id}:__conn__`
    }

    let connectionId: string | null = null
    let databaseId: string | null = null

    walkTree(tree, (current, parents) => {
        if (current.id !== nodeId) return
        connectionId = parents.find((item) => item.type === 'connection')?.id ?? null
        databaseId =
            current.type === 'database'
                ? current.id
                : parents.find((item) => item.type === 'database')?.id ?? null
        return true
    })

    if (node.type === 'table' && connectionId && databaseId) {
        return `${connectionId}:${databaseId}:${node.id}`
    }
    if (node.type === 'database' && connectionId && databaseId) {
        return `${connectionId}:${databaseId}`
    }
    return null
}

export function formatTargetLabel(target: AiDatabaseTarget): string {
    if (target.level === 'table' && target.tableLabel) {
        return `${target.connectionLabel} / ${target.databaseLabel} / ${target.tableLabel}`
    }
    if (target.level === 'connection' || target.databaseId === '__conn__') {
        return target.connectionLabel
    }
    return `${target.connectionLabel} / ${target.databaseLabel}`
}

export function targetPrimaryLabel(target: AiDatabaseTarget): string {
    if (target.level === 'table' && target.tableLabel) return target.tableLabel
    if (target.level === 'connection' || target.databaseId === '__conn__') return target.connectionLabel
    return target.databaseLabel
}

export function targetSecondaryLabel(target: AiDatabaseTarget): string | null {
    if (target.level === 'table') {
        return `${target.connectionLabel} / ${target.databaseLabel}`
    }
    if (target.level === 'database') return target.connectionLabel
    return null
}

export function targetSearchText(target: AiDatabaseTarget): string {
    return [
        target.groupLabel,
        target.connectionLabel,
        target.databaseLabel,
        target.tableLabel,
        formatTargetLabel(target),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
}
