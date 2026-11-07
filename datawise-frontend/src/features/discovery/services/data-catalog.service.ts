import type {
    DiscoveryFacets,
    DiscoveryHit,
    DiscoveryColumnPeek,
    DiscoverySearchFilters,
} from '@/features/platform/types/platform.types'
import type {LineageImpactItem} from '@/features/lineage/types/lineage.types'
import type {TreeNode} from '@/core/types'
import {findNodeById, walkTree} from '@/core/utils/tree'
import {findExplorerScopeNode} from '@/features/explorer/services/explorer-database-scope'
import {findDatabaseNode} from '@/features/explorer/services/table-migration.pure'

/** Prefer a single unambiguous downstream model for one-click lineage jump. */
export function pickLineageJumpTarget(
    impactDownstream: readonly LineageImpactItem[],
    preferredName?: string | null,
): LineageImpactItem | null {
    if (!impactDownstream.length) return null
    const preferred = preferredName?.trim().toLowerCase()
    if (preferred) {
        const exact = impactDownstream.find((item) => item.modelName.trim().toLowerCase() === preferred)
        if (exact) return exact
    }
    if (impactDownstream.length === 1) return impactDownstream[0]
    return null
}

export function discoveryHitRowKey(hit: DiscoveryHit): string {
    return `${hit.kind}|${hit.connectionId}|${hit.database}|${hit.id}|${hit.name}`
}

export interface LineageImpactSource {
    connectionId: string
    database: string
    name: string
}

export interface RelatedTableChoice {
    /** Original relatedTables entry. */
    raw: string
    /** Normalized table name for the impact API. */
    name: string
    /** Display label (usually the raw entry). */
    label: string
}

/** Unique related-table choices for a metric hit (deduped by normalized name). */
export function listRelatedTableChoices(hit: DiscoveryHit | null | undefined): RelatedTableChoice[] {
    if (!hit || hit.kind !== 'metric') return []
    const database = hit.database?.trim() ?? ''
    const seen = new Set<string>()
    const out: RelatedTableChoice[] = []
    for (const item of hit.relatedTables ?? []) {
        const raw = item.trim()
        if (!raw) continue
        const name = normalizeRelatedTableName(raw, database)
        if (!name) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push({raw, name, label: raw})
    }
    return out
}

export function needsRelatedTablePicker(hit: DiscoveryHit | null | undefined): boolean {
    return listRelatedTableChoices(hit).length > 1
}

/**
 * Resolve the physical object used for view-model impact / lineage jump.
 * For metrics with several relatedTables, pass `relatedTable` (raw or normalized name)
 * after the user picks one; otherwise the first choice is used.
 */
export function resolveLineageImpactSource(
    hit: DiscoveryHit | null | undefined,
    relatedTable?: string | null,
): LineageImpactSource | null {
    if (!hit) return null
    const connectionId = hit.connectionId?.trim()
    const database = hit.database?.trim()
    if (!connectionId || !database) return null

    if (hit.kind === 'table' || hit.kind === 'view') {
        const name = hit.name?.trim()
        return name ? {connectionId, database, name} : null
    }

    if (hit.kind === 'metric') {
        const choices = listRelatedTableChoices(hit)
        if (!choices.length) return null
        let chosen = choices[0]
        const want = relatedTable?.trim().toLowerCase()
        if (want) {
            const match = choices.find(
                (item) => item.raw.toLowerCase() === want || item.name.toLowerCase() === want,
            )
            if (!match) return null
            chosen = match
        }
        return {connectionId, database, name: chosen.name}
    }

    return null
}

/** Strip db/schema prefix when relatedTables stores qualified names. */
export function normalizeRelatedTableName(raw: string, database: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return ''
    const parts = trimmed.split('.').map((part) => part.trim()).filter(Boolean)
    if (parts.length <= 1) return parts[0] ?? ''
    const db = database.trim().toLowerCase()
    if (parts[0].toLowerCase() === db) {
        return parts.slice(1).join('.')
    }
    return parts[parts.length - 1]
}

export function canJumpLineage(hit: DiscoveryHit | null | undefined): boolean {
    return resolveLineageImpactSource(hit) != null
}

export type DiscoveryFacetKind = DiscoveryHit['kind']

export interface DataCatalogFacets {
    kinds: DiscoveryFacetKind[]
    connectionIds: string[]
    owners: string[]
    tags: string[]
}

export interface DataCatalogFacetOption {
    value: string
    label: string
    count: number
}

export const EMPTY_DATA_CATALOG_FACETS: DataCatalogFacets = {
    kinds: [],
    connectionIds: [],
    owners: [],
    tags: [],
}

export const EMPTY_SERVER_FACET_OPTIONS: {
    kinds: DataCatalogFacetOption[]
    connections: DataCatalogFacetOption[]
    owners: DataCatalogFacetOption[]
    tags: DataCatalogFacetOption[]
} = {
    kinds: [],
    connections: [],
    owners: [],
    tags: [],
}

export function hasActiveDataCatalogFacets(facets: DataCatalogFacets): boolean {
    return facets.kinds.length > 0
        || facets.connectionIds.length > 0
        || facets.owners.length > 0
        || facets.tags.length > 0
}

export function toDiscoverySearchFilters(facets: DataCatalogFacets): DiscoverySearchFilters | undefined {
    if (!hasActiveDataCatalogFacets(facets)) return undefined
    return {
        kinds: facets.kinds.length ? [...facets.kinds] : undefined,
        connectionIds: facets.connectionIds.length ? [...facets.connectionIds] : undefined,
        owners: facets.owners.length ? [...facets.owners] : undefined,
        tags: facets.tags.length ? [...facets.tags] : undefined,
    }
}

/** Prefer server facet buckets; fall back to counting loaded hits. */
export function resolveDataCatalogFacetOptions(
    serverFacets: DiscoveryFacets | null | undefined,
    hits: readonly DiscoveryHit[],
): {
    kinds: DataCatalogFacetOption[]
    connections: DataCatalogFacetOption[]
    owners: DataCatalogFacetOption[]
    tags: DataCatalogFacetOption[]
} {
    if (serverFacets) {
        return {
            kinds: [...(serverFacets.kinds ?? [])],
            connections: [...(serverFacets.connections ?? [])],
            owners: [...(serverFacets.owners ?? [])],
            tags: [...(serverFacets.tags ?? [])],
        }
    }
    return buildDataCatalogFacetOptions(hits)
}

/** Build facet chip options from the current hit set (counts reflect unfiltered hits). */
export function buildDataCatalogFacetOptions(hits: readonly DiscoveryHit[]): {
    kinds: DataCatalogFacetOption[]
    connections: DataCatalogFacetOption[]
    owners: DataCatalogFacetOption[]
    tags: DataCatalogFacetOption[]
} {
    const kindCounts = new Map<string, number>()
    const connectionCounts = new Map<string, {label: string; count: number}>()
    const ownerCounts = new Map<string, number>()
    const tagCounts = new Map<string, number>()

    for (const hit of hits) {
        kindCounts.set(hit.kind, (kindCounts.get(hit.kind) ?? 0) + 1)
        const connId = hit.connectionId?.trim()
        if (connId) {
            const prev = connectionCounts.get(connId)
            connectionCounts.set(connId, {
                label: hit.connectionLabel?.trim() || connId,
                count: (prev?.count ?? 0) + 1,
            })
        }
        const owner = hit.owner?.trim()
        if (owner) {
            ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1)
        }
        for (const tag of hit.tags ?? []) {
            const normalized = tag.trim().toLowerCase()
            if (!normalized) continue
            tagCounts.set(normalized, (tagCounts.get(normalized) ?? 0) + 1)
        }
    }

    const kindOrder: DiscoveryFacetKind[] = ['table', 'view', 'metric']
    return {
        kinds: kindOrder
            .filter((kind) => kindCounts.has(kind))
            .map((kind) => ({value: kind, label: kind, count: kindCounts.get(kind) ?? 0})),
        connections: [...connectionCounts.entries()]
            .map(([value, meta]) => ({value, label: meta.label, count: meta.count}))
            .sort((a, b) => a.label.localeCompare(b.label) || b.count - a.count),
        owners: [...ownerCounts.entries()]
            .map(([value, count]) => ({value, label: value, count}))
            .sort((a, b) => a.label.localeCompare(b.label) || b.count - a.count),
        tags: [...tagCounts.entries()]
            .map(([value, count]) => ({value, label: value, count}))
            .sort((a, b) => a.label.localeCompare(b.label) || b.count - a.count),
    }
}

export function filterDiscoveryHitsByFacets(
    hits: readonly DiscoveryHit[],
    facets: DataCatalogFacets,
): DiscoveryHit[] {
    const kinds = new Set(facets.kinds)
    const connections = new Set(facets.connectionIds)
    const owners = new Set(facets.owners.map((item) => item.trim()).filter(Boolean))
    const tags = new Set(facets.tags.map((item) => item.trim().toLowerCase()).filter(Boolean))
    if (!kinds.size && !connections.size && !owners.size && !tags.size) {
        return [...hits]
    }
    return hits.filter((hit) => {
        if (kinds.size && !kinds.has(hit.kind)) return false
        if (connections.size && !connections.has(hit.connectionId)) return false
        if (owners.size) {
            const owner = hit.owner?.trim() ?? ''
            if (!owner || !owners.has(owner)) return false
        }
        if (tags.size) {
            const hitTags = (hit.tags ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean)
            if (!hitTags.some((tag) => tags.has(tag))) return false
        }
        return true
    })
}

export function toggleFacetValue<T extends string>(selected: readonly T[], value: T): T[] {
    return selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value]
}

/** Next offset for Load more, or null when the page is complete. */
export function nextDiscoveryOffset(page: {
    offset: number
    hits: readonly unknown[]
    hasMore: boolean
}): number | null {
    if (!page.hasMore) return null
    return page.offset + page.hits.length
}

export const DATA_CATALOG_PAGE_SIZE = 40
export const DISCOVERY_COLUMN_PEEK_MAX = 40

function normalizeColumnType(meta?: string | null): string | null {
    if (!meta) return null
    const trimmed = meta.replace(/\s*·\s*pk$/i, '').trim()
    return trimmed || null
}

function mapTreeColumnNodes(columnNodes: readonly TreeNode[]): DiscoveryColumnPeek[] {
    const out: DiscoveryColumnPeek[] = []
    for (const node of columnNodes) {
        if (node.type !== 'column' && node.type !== 'primary_key') continue
        const name = node.label?.trim()
        if (!name) continue
        out.push({name, type: normalizeColumnType(node.meta)})
        if (out.length >= DISCOVERY_COLUMN_PEEK_MAX) break
    }
    return out
}

function findRelationNodeUnderScope(
    scopeNode: TreeNode,
    relationName: string,
    kind: 'table' | 'view',
): TreeNode | null {
    const trimmed = relationName.trim()
    if (!trimmed) return null
    const folderLabel = kind === 'view' ? 'views' : 'tables'
    const folder = scopeNode.children?.find(
        (child) => child.type === 'folder' && child.label.toLowerCase() === folderLabel,
    )
    const searchRoots = folder?.children?.length ? folder.children : scopeNode.children ?? []
    let found: TreeNode | null = null
    walkTree(searchRoots, (node) => {
        if (node.type === kind && node.label === trimmed) {
            found = node
            return true
        }
    })
    return found
}

function resolveColumnsFromExplorerTree(
    hit: DiscoveryHit,
    explorerTree: readonly TreeNode[],
): DiscoveryColumnPeek[] {
    if (hit.kind !== 'table' && hit.kind !== 'view') return []
    const connection = findNodeById(explorerTree, hit.connectionId)
    if (!connection) return []
    const scopeNode = findExplorerScopeNode(connection, connection.dbType, hit.database)
        ?? findDatabaseNode(connection, hit.database)
    if (!scopeNode) return []
    const relation = findRelationNodeUnderScope(scopeNode, hit.name, hit.kind)
    if (!relation) return []
    const columnsFolder = relation.children?.find((child) => child.type === 'columns')
    return mapTreeColumnNodes(columnsFolder?.children ?? [])
}

function capDiscoveryColumnPeek(columns: readonly DiscoveryColumnPeek[]): DiscoveryColumnPeek[] {
    return columns.slice(0, DISCOVERY_COLUMN_PEEK_MAX)
}

/** Prefer hydrated explorer tree columns; fall back to discovery hit payload. */
export function resolveDiscoveryHitColumnPeek(
    hit: DiscoveryHit | null | undefined,
    explorerTree: readonly TreeNode[],
): DiscoveryColumnPeek[] {
    if (!hit || (hit.kind !== 'table' && hit.kind !== 'view')) return []
    const fromExplorer = resolveColumnsFromExplorerTree(hit, explorerTree)
    if (fromExplorer.length) return capDiscoveryColumnPeek(fromExplorer)
    const fromHit = (hit.columns ?? [])
        .map((column) => ({
            name: column.name?.trim() ?? '',
            type: column.type?.trim() || null,
        }))
        .filter((column) => column.name.length > 0)
    return capDiscoveryColumnPeek(fromHit)
}
