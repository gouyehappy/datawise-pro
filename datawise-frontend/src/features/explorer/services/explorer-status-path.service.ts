import type {ComposerTranslation} from 'vue-i18n'
import type {ConnectionConfig, DbType, TreeNode} from '@/core/types'
import {findNodeAncestorChain} from '@/core/utils/tree'

export type ExplorerStatusSegmentKind =
    | 'connection'
    | 'database'
    | 'schema'
    | 'object'

export interface ExplorerStatusSegment {
    id: string
    kind: ExplorerStatusSegmentKind
    label: string
    dbType?: DbType
}

export function formatConnectionEndpointLabel(
    config: Pick<ConnectionConfig, 'name' | 'host' | 'port'>,
): string {
    const host = config.host?.trim()
    const port = config.port?.trim()
    if (host && port) return `@${host}:${port}`
    if (host) return `@${host}`
    return config.name?.trim() || ''
}

const SKIP_TRAIL_TYPES = new Set<TreeNode['type']>(['connection', 'group', 'database', 'schema'])
const SKIP_CATALOG_FOLDER_TYPES = new Set<TreeNode['type']>(['folder', 'columns', 'keys', 'indexes'])

function appendTrailSegments(
    segments: ExplorerStatusSegment[],
    chain: TreeNode[],
    startIndex: number,
) {
    for (let index = startIndex; index < chain.length; index += 1) {
        const node = chain[index]
        if (node.type === 'schema') {
            segments.push({id: node.id, kind: 'schema', label: node.label})
            continue
        }
        if (SKIP_CATALOG_FOLDER_TYPES.has(node.type)) continue
        if (SKIP_TRAIL_TYPES.has(node.type)) continue
        segments.push({id: node.id, kind: 'object', label: node.label})
    }
}

export function buildExplorerStatusPath(
    tree: TreeNode[],
    selectedNodeId: string | null,
    _t: ComposerTranslation,
    endpointByConnectionId: ReadonlyMap<string, string>,
): ExplorerStatusSegment[] {
    if (!selectedNodeId) return []

    const chain = findNodeAncestorChain(tree, selectedNodeId)
    if (!chain.length) return []

    const selected = chain[chain.length - 1]
    const segments: ExplorerStatusSegment[] = []

    if (selected.type === 'group') {
        segments.push({id: selected.id, kind: 'object', label: selected.label})
        return segments
    }

    const connection = chain.find((node) => node.type === 'connection')
    if (connection) {
        segments.push({
            id: connection.id,
            kind: 'connection',
            label: endpointByConnectionId.get(connection.id) || connection.label,
            dbType: connection.dbType,
        })
    }

    const databaseIndex = chain.findIndex((node) => node.type === 'database')
    if (databaseIndex >= 0 && selected.type !== 'connection') {
        const database = chain[databaseIndex]
        segments.push({
            id: database.id,
            kind: 'database',
            label: database.label,
            dbType: connection?.dbType,
        })
        if (selected.id !== database.id) {
            appendTrailSegments(segments, chain, databaseIndex + 1)
        }
        return segments
    }

    const schemaIndex = chain.findIndex((node) => node.type === 'schema')
    if (schemaIndex >= 0 && selected.type !== 'connection') {
        appendTrailSegments(segments, chain, schemaIndex)
        return segments
    }

    if (selected.type !== 'connection') {
        appendTrailSegments(segments, chain, chain.indexOf(connection ?? selected) + 1)
    }

    return segments
}
