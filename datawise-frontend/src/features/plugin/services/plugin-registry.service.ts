import type {ContextMenuItem, DbType, NavModule, PluginItem, SettingsSection, ShortcutPanel} from '@/core/types'

export const PLUGIN_IDS = [
    'p-grid-export',
    'p-sql-format',
    'p-ai-workbench',
    'p-console-ai',
    'p-sql-snippets',
    'p-sql-snippets-team',
    'p-sql-snippets-personal',
    'p-sql-history',
    'p-sql-monitor',
    'p-redis-explorer',
    'p-kafka-explorer',
    'p-yarn-explorer',
    'p-kubernetes-explorer',
    'p-mongo-explorer',
    'p-starrocks-explorer',
    'p-doris-explorer',
    'p-trino-explorer',
    'p-clickhouse-explorer',
    'p-sqlite-explorer',
    'p-oracle-explorer',
    'p-hive-explorer',
    'p-kudu-explorer',
    'p-sqlserver-explorer',
    'p-mariadb-explorer',
    'p-mysql-explorer',
    'p-postgresql-explorer',
    'p-dm-explorer',
    'p-oscar-explorer',
    'p-tidb-explorer',
    'p-tdengine-explorer',
    'p-sybase-explorer',
    'p-phoenix-explorer',
    'p-cachedb-explorer',
    'p-h2-explorer',
    'p-hsql-explorer',
    'p-db2-explorer',
    'p-oceanbase-explorer',
    'p-kingbase-explorer',
    'p-greenplum-explorer',
    'p-opengauss-explorer',
    'p-highgo-explorer',
    'p-gbase8a-explorer',
    'p-elasticsearch-explorer',
    'p-kylin-explorer',
    'p-gaussdb-explorer',
    'p-flink-explorer',
    'p-explain-plan',
    'p-schema-compare',
    'p-cross-env-compare',
    'p-sql-bookmarks',
    'p-migration-tasks',
    'p-export-progress',
    'p-result-diff',
    'p-fake-data',
    'p-ai-index-suggest',
    'p-export-mask',
    'p-table-codegen',
    'p-ai-sql-fix',
    'p-ai-result-summary',
    'p-ai-explain',
    'p-dml-generate',
    'p-grid-edit',
] as const

export type SqlSnippetLayerId = 'bundled' | 'team' | 'personal'

const SQL_SNIPPET_LAYER_PLUGIN_IDS: Record<SqlSnippetLayerId, PluginId> = {
    bundled: 'p-sql-snippets',
    team: 'p-sql-snippets-team',
    personal: 'p-sql-snippets-personal',
}

export type PluginId = (typeof PLUGIN_IDS)[number]

/** 旧版插件 id → 新版（配置迁移） */
export const LEGACY_PLUGIN_ID_MAP: Record<string, PluginId> = {
    'p-csv-export': 'p-grid-export',
    'p-formatter': 'p-sql-format',
    'p-sql-ai': 'p-ai-workbench',
    'p-mysql-driver': 'p-sql-snippets',
    'p-redis-cli': 'p-redis-explorer',
}

/** 数据源类型 → 插件门禁（新建连接可选类型） */
const DB_TYPE_PLUGIN_MAP: Partial<Record<DbType, PluginId>> = {
    redis: 'p-redis-explorer',
    kafka: 'p-kafka-explorer',
    yarn: 'p-yarn-explorer',
    kubernetes: 'p-kubernetes-explorer',
    mongodb: 'p-mongo-explorer',
    starrocks: 'p-starrocks-explorer',
    doris: 'p-doris-explorer',
    trino: 'p-trino-explorer',
    presto: 'p-trino-explorer',
    clickhouse: 'p-clickhouse-explorer',
    sqlite: 'p-sqlite-explorer',
    oracle: 'p-oracle-explorer',
    hive: 'p-hive-explorer',
    kudu: 'p-kudu-explorer',
    sqlserver: 'p-sqlserver-explorer',
    mariadb: 'p-mariadb-explorer',
    mysql: 'p-mysql-explorer',
    postgresql: 'p-postgresql-explorer',
    dm: 'p-dm-explorer',
    oscar: 'p-oscar-explorer',
    tidb: 'p-tidb-explorer',
    tdengine: 'p-tdengine-explorer',
    sybase: 'p-sybase-explorer',
    phoenix: 'p-phoenix-explorer',
    cachedb: 'p-cachedb-explorer',
    h2: 'p-h2-explorer',
    hsql: 'p-hsql-explorer',
    db2: 'p-db2-explorer',
    oceanbase: 'p-oceanbase-explorer',
    kingbase: 'p-kingbase-explorer',
    greenplum: 'p-greenplum-explorer',
    opengauss: 'p-opengauss-explorer',
    highgo: 'p-highgo-explorer',
    gbase8a: 'p-gbase8a-explorer',
    elasticsearch: 'p-elasticsearch-explorer',
    kylin: 'p-kylin-explorer',
    gaussdb: 'p-gaussdb-explorer',
    flink: 'p-flink-explorer',
}

/** Explorer / 结果区菜单项 → 插件门禁 */
const PLUGIN_GATED_MENU_IDS: Partial<Record<string, PluginId>> = {
    'schema-compare': 'p-schema-compare',
    'cross-env-compare': 'p-cross-env-compare',
    'migrate-data': 'p-migration-tasks',
}

/** ShortcutRail 面板 → 插件门禁（info 无门禁） */
export const SHORTCUT_PANEL_PLUGIN_MAP: Partial<Record<ShortcutPanel, PluginId>> = {
    history: 'p-sql-history',
    monitor: 'p-sql-monitor',
    console: 'p-sql-bookmarks',
    migration: 'p-migration-tasks',
    export: 'p-export-progress',
}

export interface PluginRegistryMeta {
    tone: 'violet' | 'sky' | 'rose' | 'emerald' | 'amber' | 'indigo'
    surfaces: string[]
    openModule: NavModule | 'database' | 'settings' | null
    settingsTab?: SettingsSection
    /** 建议同时启用的插件（仅 UI 提示，不强制门禁） */
    requires?: PluginId[]
}

export const PLUGIN_REGISTRY: Record<PluginId, PluginRegistryMeta> = {
    'p-grid-export': {
        tone: 'amber',
        surfaces: ['dataGrid', 'tableData'],
        openModule: 'database',
    },
    'p-sql-format': {
        tone: 'violet',
        surfaces: ['sqlConsole'],
        openModule: 'database',
    },
    'p-ai-workbench': {
        tone: 'rose',
        surfaces: ['sideRail', 'aiWorkbench'],
        openModule: 'ai',
    },
    'p-console-ai': {
        tone: 'rose',
        surfaces: ['sqlConsole'],
        openModule: 'database',
    },
    'p-sql-snippets': {
        tone: 'indigo',
        surfaces: ['sqlEditor', 'settings'],
        openModule: 'settings',
        settingsTab: 'sqlSnippets',
    },
    'p-sql-snippets-team': {
        tone: 'indigo',
        surfaces: ['sqlEditor', 'settings'],
        openModule: 'settings',
        settingsTab: 'sqlSnippets',
        requires: ['p-sql-snippets'],
    },
    'p-sql-snippets-personal': {
        tone: 'indigo',
        surfaces: ['sqlEditor', 'settings'],
        openModule: 'settings',
        settingsTab: 'sqlSnippets',
    },
    'p-sql-history': {
        tone: 'sky',
        surfaces: ['shortcutRail'],
        openModule: 'database',
    },
    'p-sql-monitor': {
        tone: 'sky',
        surfaces: ['shortcutRail'],
        openModule: 'database',
    },
    'p-redis-explorer': {
        tone: 'emerald',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-kafka-explorer': {
        tone: 'amber',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-yarn-explorer': {
        tone: 'amber',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-kubernetes-explorer': {
        tone: 'sky',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-mongo-explorer': {
        tone: 'emerald',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-starrocks-explorer': {
        tone: 'amber',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-doris-explorer': {
        tone: 'amber',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-trino-explorer': {
        tone: 'sky',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-clickhouse-explorer': {
        tone: 'amber',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-sqlite-explorer': {
        tone: 'indigo',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-oracle-explorer': {
        tone: 'amber',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-hive-explorer': {
        tone: 'emerald',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-kudu-explorer': {
        tone: 'amber',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-sqlserver-explorer': {
        tone: 'sky',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-mariadb-explorer': {
        tone: 'amber',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-mysql-explorer': {
        tone: 'emerald',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-postgresql-explorer': {
        tone: 'indigo',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-dm-explorer': {
        tone: 'amber',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-oscar-explorer': {
        tone: 'indigo',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-tidb-explorer': {
        tone: 'emerald',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-tdengine-explorer': {
        tone: 'sky',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-sybase-explorer': {
        tone: 'amber',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-phoenix-explorer': {
        tone: 'violet',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-cachedb-explorer': {
        tone: 'rose',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-h2-explorer': {
        tone: 'indigo',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-hsql-explorer': {
        tone: 'indigo',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-db2-explorer': {
        tone: 'sky',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-oceanbase-explorer': {
        tone: 'emerald',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-kingbase-explorer': {
        tone: 'indigo',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-greenplum-explorer': {
        tone: 'emerald',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-opengauss-explorer': {
        tone: 'indigo',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-highgo-explorer': {
        tone: 'indigo',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-gbase8a-explorer': {
        tone: 'emerald',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-elasticsearch-explorer': {
        tone: 'amber',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-kylin-explorer': {
        tone: 'violet',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-gaussdb-explorer': {
        tone: 'rose',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-flink-explorer': {
        tone: 'amber',
        surfaces: ['connectionForm', 'explorer'],
        openModule: 'database',
    },
    'p-explain-plan': {
        tone: 'violet',
        surfaces: ['sqlConsole', 'shortcutRail'],
        openModule: 'database',
    },
    'p-schema-compare': {
        tone: 'indigo',
        surfaces: ['explorer'],
        openModule: 'database',
    },
    'p-cross-env-compare': {
        tone: 'sky',
        surfaces: ['explorer', 'sqlConsole'],
        openModule: 'database',
    },
    'p-sql-bookmarks': {
        tone: 'amber',
        surfaces: ['shortcutRail', 'sqlConsole', 'commandPalette'],
        openModule: 'database',
    },
    'p-migration-tasks': {
        tone: 'indigo',
        surfaces: ['shortcutRail', 'explorer'],
        openModule: 'database',
    },
    'p-export-progress': {
        tone: 'amber',
        surfaces: ['shortcutRail'],
        openModule: 'database',
    },
    'p-result-diff': {
        tone: 'sky',
        surfaces: ['sqlConsole'],
        openModule: 'database',
    },
    'p-fake-data': {
        tone: 'emerald',
        surfaces: ['tableData'],
        openModule: 'database',
    },
    'p-ai-index-suggest': {
        tone: 'rose',
        surfaces: ['sqlConsole'],
        openModule: 'database',
        requires: ['p-console-ai'],
    },
    'p-export-mask': {
        tone: 'amber',
        surfaces: ['dataGrid', 'tableData'],
        openModule: 'database',
    },
    'p-table-codegen': {
        tone: 'indigo',
        surfaces: ['tableData'],
        openModule: 'database',
    },
    'p-ai-sql-fix': {
        tone: 'rose',
        surfaces: ['sqlConsole'],
        openModule: 'database',
        requires: ['p-console-ai'],
    },
    'p-ai-result-summary': {
        tone: 'rose',
        surfaces: ['sqlConsole'],
        openModule: 'database',
        requires: ['p-console-ai'],
    },
    'p-ai-explain': {
        tone: 'rose',
        surfaces: ['sqlConsole'],
        openModule: 'database',
        requires: ['p-console-ai', 'p-explain-plan'],
    },
    'p-dml-generate': {
        tone: 'violet',
        surfaces: ['sqlConsole', 'dataGrid'],
        openModule: 'database',
    },
    'p-grid-edit': {
        tone: 'emerald',
        surfaces: ['tableData', 'dataGrid'],
        openModule: 'database',
    },
}

export function normalizePluginId(id: string): string {
    return LEGACY_PLUGIN_ID_MAP[id] ?? id
}

export function mergePluginCatalog(
    catalog: PluginItem[],
    overrides: Record<string, boolean | undefined>,
): PluginItem[] {
    const mergedOverrides: Record<string, boolean> = {}
    for (const [rawId, value] of Object.entries(overrides)) {
        if (typeof value !== 'boolean') continue
        mergedOverrides[normalizePluginId(rawId)] = value
    }

    return catalog.map((item) => {
        const id = normalizePluginId(item.id)
        return {
            ...item,
            id,
            enabled: mergedOverrides[id] ?? item.enabled,
        }
    })
}

/** 解析插件是否启用（catalog 默认 + 本地覆盖） */
export function resolvePluginEnabled(
    id: string,
    catalog: PluginItem[],
    overrides: Record<string, boolean | undefined>,
): boolean {
    const key = normalizePluginId(id)
    const mergedOverrides: Record<string, boolean> = {}
    for (const [rawId, value] of Object.entries(overrides)) {
        if (typeof value !== 'boolean') continue
        mergedOverrides[normalizePluginId(rawId)] = value
    }
    if (typeof mergedOverrides[key] === 'boolean') return mergedOverrides[key]
    // 旧版 p-sql-history 同时控制 History + Monitor；关闭时 Monitor 一并隐藏
    if (key === 'p-sql-monitor' && mergedOverrides['p-sql-history'] === false) {
        return false
    }
    const item = catalog.find((entry) => normalizePluginId(entry.id) === key)
    return item?.enabled ?? true
}

export function resolveDbTypesForPlugins(
    types: DbType[],
    isEnabled: (id: PluginId) => boolean,
): DbType[] {
    return types.filter((type) => {
        const pluginId = DB_TYPE_PLUGIN_MAP[type]
        if (!pluginId) return true
        return isEnabled(pluginId)
    })
}

/** 按插件开关过滤 Explorer / 结果区上下文菜单项 */
export function filterPluginGatedMenuItems(
    items: ContextMenuItem[],
    isEnabled: (id: PluginId) => boolean,
): ContextMenuItem[] {
    return items.filter((item) => {
        const pluginId = PLUGIN_GATED_MENU_IDS[item.id]
        if (!pluginId) return true
        return isEnabled(pluginId)
    })
}

/** ShortcutRail 面板是否因插件开关而可见 */
export function isShortcutPanelEnabled(
    panel: ShortcutPanel,
    isEnabled: (id: PluginId) => boolean,
): boolean {
    const pluginId = SHORTCUT_PANEL_PLUGIN_MAP[panel]
    if (!pluginId) return true
    return isEnabled(pluginId)
}

/** 插件注册表中出现的全部 surface id（排序后） */
/** 数据源插件 id → 受门禁的 DbType（如 trino/presto 共用 p-trino-explorer） */
export function listDbTypesForPlugin(pluginId: PluginId): DbType[] {
    return (Object.entries(DB_TYPE_PLUGIN_MAP) as [DbType, PluginId][])
        .filter(([, id]) => id === pluginId)
        .map(([type]) => type)
}

export function listPluginSurfaceIds(): string[] {
    const surfaces = new Set<string>()
    for (const meta of Object.values(PLUGIN_REGISTRY)) {
        for (const surface of meta.surfaces) surfaces.add(surface)
    }
    return [...surfaces].sort()
}

export function pluginHasSurface(pluginId: PluginId, surface: string): boolean {
    return PLUGIN_REGISTRY[pluginId]?.surfaces.includes(surface) ?? false
}

/** 关闭插件时应收起的 ShortcutRail 面板（若有） */
export function shortcutPanelForPlugin(pluginId: PluginId): ShortcutPanel | null {
    for (const [panel, id] of Object.entries(SHORTCUT_PANEL_PLUGIN_MAP) as [ShortcutPanel, PluginId][]) {
        if (id === pluginId) return panel
    }
    return null
}

export function isPluginId(value: string): value is PluginId {
    return (PLUGIN_IDS as readonly string[]).includes(value)
}

/** 已注册 Hook 的插件 id 是否存在于内置 catalog */
export function isKnownPluginId(value: string): boolean {
    return isPluginId(normalizePluginId(value))
}

export function listPluginRequires(id: PluginId): PluginId[] {
    return PLUGIN_REGISTRY[id]?.requires ?? []
}

/** 插件中心相关设置页分区（对照预设等） */
export const PLUGIN_CENTER_SETTINGS_TAB = 'plugins' as const satisfies SettingsSection

/** 注册表显式 settingsTab 或 Explorer 插件默认跳转插件设置 */
export function resolvePluginSettingsTab(id: PluginId): SettingsSection | undefined {
    const meta = PLUGIN_REGISTRY[id]
    if (meta?.settingsTab) return meta.settingsTab
    if (listDbTypesForPlugin(id).length > 0) return PLUGIN_CENTER_SETTINGS_TAB
    return undefined
}

export function pluginRequiresSatisfied(
    pluginId: PluginId,
    isEnabled: (id: PluginId) => boolean,
): boolean {
    return listPluginRequires(pluginId).every((requiredId) => isEnabled(requiredId))
}

export function pluginHasUnmetRequires(
    plugin: PluginItem,
    isEnabled: (id: PluginId) => boolean,
): boolean {
    if (!plugin.enabled) return false
    return !pluginRequiresSatisfied(plugin.id as PluginId, isEnabled)
}

export function sqlSnippetLayerPluginId(layer: SqlSnippetLayerId): PluginId {
    return SQL_SNIPPET_LAYER_PLUGIN_IDS[layer]
}

/** SQL 片段分层开关；关闭 p-sql-snippets 时兼容旧配置（三层一并关闭） */
export function resolveSqlSnippetLayerEnabled(
    layer: SqlSnippetLayerId,
    catalog: PluginItem[],
    overrides: Record<string, boolean | undefined>,
): boolean {
    const pluginId = SQL_SNIPPET_LAYER_PLUGIN_IDS[layer]
    const normalized: Record<string, boolean> = {}
    for (const [rawId, value] of Object.entries(overrides)) {
        if (typeof value === 'boolean') normalized[normalizePluginId(rawId)] = value
    }

    const layerOverride = normalized[pluginId]
    if (typeof layerOverride === 'boolean') return layerOverride

    if (normalized['p-sql-snippets'] === false) return false

    return resolvePluginEnabled(pluginId, catalog, overrides)
}
