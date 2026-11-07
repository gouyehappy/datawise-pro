import type {DataSourceOption, DbType, TreeNode} from '@/core/types'
import {formatConsoleInstanceValue} from '@/features/workspace/services/console-instance-display'
import {extractConnectionsFromTree} from '@/features/explorer/utils/tree-targets'

/** 从连接树提取「数据源 → 实例」层级选项 */
export function extractDataSources(tree: TreeNode[]): DataSourceOption[] {
    return extractConnectionsFromTree(tree).map((conn) => ({
        id: conn.id,
        label: conn.label,
        dbType: conn.dbType,
        instances: conn.databases,
    }))
}

export function findDataSource<T extends { id: string }>(sources: T[], id: string): T | undefined {
    return sources.find((source) => source.id === id)
}

export type ConnectionHealthState = 'ok' | 'error'

/** 控制台可选数据源：探测失败不可选；未探测的冷连接仍可选（按需再连）。 */
export function isDataSourceSelectable(
    source: DataSourceOption,
    healthById: Record<string, ConnectionHealthState>,
): boolean {
    return healthById[source.id] !== 'error'
}

export function filterSelectableDataSources(
    sources: DataSourceOption[],
    healthById: Record<string, ConnectionHealthState>,
): DataSourceOption[] {
    return sources.filter((source) => isDataSourceSelectable(source, healthById))
}

export function pickDefaultDataSource(
    sources: DataSourceOption[],
    healthById: Record<string, ConnectionHealthState>,
    preferredId?: string | null,
    preferPooledIds?: ReadonlySet<string>,
): DataSourceOption | undefined {
    const selectable = filterSelectableDataSources(sources, healthById)
    if (preferredId) {
        const preferred = selectable.find((source) => source.id === preferredId)
        if (preferred) return preferred
    }
    if (preferPooledIds?.size) {
        const pooled = selectable.find((source) => preferPooledIds.has(source.id))
        if (pooled) return pooled
    }
    return selectable[0]
}

/**
 * @deprecated Prefer loading a single chosen connection. Kept for tests / rare callers.
 * Do not use on app start or blank console open — it wakes every datasource.
 */
export async function probeAllConnections(
    tree: TreeNode[],
    ensureLoaded: (connectionId: string) => Promise<void>,
): Promise<void> {
    const connections = extractConnectionsFromTree(tree)
    await Promise.allSettled(connections.map((conn) => ensureLoaded(conn.id)))
}

/**
 * Prefer the connection form's default database over the first catalog entry.
 * When the tree is not loaded yet, still bind the configured name.
 */
export function resolvePreferredConsoleInstance(options: {
    configuredDatabase?: string | null
    instances: { id: string; label: string }[]
    fallbackToFirst?: boolean
}): { instanceId: string | null; database?: string } {
    const configured = options.configuredDatabase?.trim()
    if (configured) {
        const exact = options.instances.find((item) => item.label === configured)
        const match = exact ?? options.instances.find(
            (item) => item.label.toLowerCase() === configured.toLowerCase(),
        )
        if (match) {
            return {instanceId: match.id, database: match.label}
        }
        return {instanceId: null, database: configured}
    }
    if (options.fallbackToFirst !== false && options.instances.length) {
        const first = options.instances[0]
        return {instanceId: first.id, database: first.label}
    }
    return {instanceId: null, database: undefined}
}

export function resolveInstanceId(
    source: { instances: { id: string }[] } | undefined,
    preferredId?: string | null,
): string | null {
    if (!source?.instances.length) return null
    if (preferredId && source.instances.some((item) => item.id === preferredId)) return preferredId
    return source.instances[0].id
}

/** 解析 Tab 绑定的实例：树未加载时保留 tab 字段，加载后按 id / database 名匹配 */
export function resolveBoundInstanceId(options: {
    instances: { id: string; label: string }[]
    tabInstanceId?: string | null
    tabDatabase?: string
    /** 已保存 workspaces 脚本：不匹配时不回落到 instances[0] */
    preserveBinding?: boolean
}): string | null {
    const {instances, tabInstanceId, tabDatabase, preserveBinding} = options
    if (!instances.length) {
        return tabInstanceId ?? null
    }
    if (tabInstanceId && instances.some((item) => item.id === tabInstanceId)) {
        return tabInstanceId
    }
    const database = tabDatabase?.trim()
    if (database) {
        const byLabel = instances.find((item) => item.label === database)
        if (byLabel) return byLabel.id
    }
    if (preserveBinding && (tabInstanceId || database)) {
        return tabInstanceId ?? null
    }
    if (tabInstanceId) return tabInstanceId
    return instances[0]?.id ?? null
}

export function includePinnedDataSource(
    sources: DataSourceOption[],
    selectable: DataSourceOption[],
    healthById: Record<string, ConnectionHealthState>,
    pinnedId?: string | null,
): DataSourceOption[] {
    if (!pinnedId) return selectable
    const pinned = findDataSource(sources, pinnedId)
    if (!pinned) return selectable
    if (isDataSourceSelectable(pinned, healthById)) return selectable
    if (selectable.some((item) => item.id === pinnedId)) return selectable
    return [pinned, ...selectable]
}

export function resolveInstanceDisplayLabel(options: {
    instances: { id: string; label: string }[]
    instanceId: string | null
    boundDatabaseLabel?: string
    dbType?: DbType
}): string | undefined {
    let raw: string | undefined
    if (options.instanceId) {
        const match = options.instances.find((item) => item.id === options.instanceId)
        if (match) raw = match.label
    }
    if (!raw) {
        raw = options.boundDatabaseLabel?.trim() || undefined
    }
    if (!raw) return undefined
    return formatConsoleInstanceValue(options.dbType, raw)
}

export {findParentConnectionId} from '@/core/utils/tree'
