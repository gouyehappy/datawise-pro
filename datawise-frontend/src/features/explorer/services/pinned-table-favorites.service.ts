import type {DbType, TreeNode} from '@/core/types'
import {findNodeById} from '@/core/utils/tree'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {
    canPersistLocalResource,
    canReadResource,
    resolveResourceStorageKey,
} from '@/features/auth/services/user-resource-policy'
import {resolveTableContext} from '@/features/explorer/services/table-context-actions.service'
import {readPinnedExplorerNodeIds} from '@/features/explorer/services/pinned-explorer-nodes.service'

export interface PinnedTableFavorite {
    nodeId: string
    connectionId: string
    database: string
    tableName: string
    connectionLabel?: string
    dbType?: DbType
}

const METADATA_STORAGE_KEY = 'datawise-pinned-table-favorites'

function resolveMetadataStorageKey(): string {
    return resolveResourceStorageKey(UserResource.PinnedExplorerNodes, METADATA_STORAGE_KEY) ?? METADATA_STORAGE_KEY
}

function readMetadataRecord(): Record<string, PinnedTableFavorite> {
    if (!canReadResource(UserResource.PinnedExplorerNodes)) return {}
    if (!canPersistLocalResource(UserResource.PinnedExplorerNodes)) return {}
    try {
        const raw = localStorage.getItem(resolveMetadataStorageKey())
        if (!raw) return {}
        const parsed = JSON.parse(raw) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
        const record: Record<string, PinnedTableFavorite> = {}
        for (const [nodeId, value] of Object.entries(parsed)) {
            if (!value || typeof value !== 'object') continue
            const entry = value as Partial<PinnedTableFavorite>
            if (
                typeof entry.nodeId !== 'string'
                || typeof entry.connectionId !== 'string'
                || typeof entry.database !== 'string'
                || typeof entry.tableName !== 'string'
            ) {
                continue
            }
            record[nodeId] = {
                nodeId: entry.nodeId,
                connectionId: entry.connectionId,
                database: entry.database,
                tableName: entry.tableName,
                connectionLabel: typeof entry.connectionLabel === 'string' ? entry.connectionLabel : undefined,
                dbType: entry.dbType,
            }
        }
        return record
    } catch {
        return {}
    }
}

function writeMetadataRecord(record: Record<string, PinnedTableFavorite>) {
    if (!canPersistLocalResource(UserResource.PinnedExplorerNodes)) return
    localStorage.setItem(resolveMetadataStorageKey(), JSON.stringify(record))
}

export function readPinnedTableFavorites(): PinnedTableFavorite[] {
    const record = readMetadataRecord()
    const orderedIds = readPinnedExplorerNodeIds()
    const seen = new Set<string>()
    const favorites: PinnedTableFavorite[] = []

    for (const nodeId of orderedIds) {
        const entry = record[nodeId]
        if (!entry || seen.has(nodeId)) continue
        seen.add(nodeId)
        favorites.push(entry)
    }

    return favorites
}

export function upsertPinnedTableFavorite(entry: PinnedTableFavorite) {
    const record = readMetadataRecord()
    record[entry.nodeId] = entry
    writeMetadataRecord(record)
}

export function removePinnedTableFavorite(nodeId: string) {
    const record = readMetadataRecord()
    if (!(nodeId in record)) return
    delete record[nodeId]
    writeMetadataRecord(record)
}

export function isPinnedTableFavorite(nodeId: string): boolean {
    return nodeId in readMetadataRecord()
}

export function backfillPinnedTableMetadata(tree: readonly TreeNode[]) {
    if (!canPersistLocalResource(UserResource.PinnedExplorerNodes)) return
    const record = readMetadataRecord()
    let changed = false

    for (const nodeId of readPinnedExplorerNodeIds()) {
        if (record[nodeId]) continue
        const node = findNodeById([...tree], nodeId)
        if (node?.type !== 'table') continue
        const ctx = resolveTableContext([...tree], node)
        if (!ctx) continue
        const connection = findNodeById([...tree], ctx.connectionId)
        record[nodeId] = {
            nodeId: ctx.nodeId,
            connectionId: ctx.connectionId,
            database: ctx.database,
            tableName: ctx.tableName,
            connectionLabel: connection?.label,
            dbType: ctx.dbType,
        }
        changed = true
    }

    if (changed) writeMetadataRecord(record)
}
