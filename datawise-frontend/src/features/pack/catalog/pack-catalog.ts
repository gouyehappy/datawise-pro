import type {DbType} from '@/core/types'
import {PACK_AI_OFFLINE_ID, type PackDefinition, type PackId, type SuiteDefinition} from '@/features/pack/types/pack.types'

/** 冻结目录：与 PRODUCT_EXTENSION_PACKS.md §3 一致（含 Wave 28 pack.ai.offline） */
export const PACK_CATALOG: readonly PackDefinition[] = [
    {
        id: 'pack.ai',
        category: 'capability',
        tone: 'rose',
        order: 10,
        featured: true,
        capabilities: ['ai.workbench', 'ai.console', 'ai.analyze', 'ai.rag', 'ai.quota'],
        plugins: [
            'p-ai-workbench',
            'p-console-ai',
            'p-ai-sql-fix',
            'p-ai-result-summary',
            'p-ai-explain',
            'p-ai-index-suggest',
        ],
    },
    {
        id: PACK_AI_OFFLINE_ID,
        category: 'capability',
        tone: 'rose',
        order: 11,
        capabilities: ['ai.workbench', 'ai.console', 'ai.analyze', 'ai.rag', 'ai.offline'],
        plugins: [
            'p-ai-workbench',
            'p-console-ai',
            'p-ai-sql-fix',
            'p-ai-result-summary',
            'p-ai-explain',
            'p-ai-index-suggest',
        ],
    },
    {
        id: 'pack.migration',
        category: 'capability',
        tone: 'indigo',
        order: 20,
        featured: true,
        capabilities: ['migration.task', 'migration.sync', 'migration.progress'],
        plugins: ['p-migration-tasks', 'p-export-progress'],
    },
    {
        id: 'pack.governance',
        category: 'capability',
        tone: 'sky',
        order: 30,
        capabilities: ['gov.schema.compare', 'gov.cross.env', 'gov.result.diff'],
        plugins: ['p-schema-compare', 'p-cross-env-compare', 'p-result-diff'],
    },
    {
        id: 'pack.lineage',
        category: 'capability',
        tone: 'violet',
        order: 40,
        capabilities: ['lineage.parse', 'lineage.impact'],
    },
    {
        id: 'pack.backup',
        category: 'capability',
        tone: 'amber',
        order: 50,
        featured: true,
        capabilities: ['backup.policy', 'backup.run', 'backup.restore'],
    },
    {
        id: 'pack.dataops',
        category: 'capability',
        tone: 'emerald',
        order: 60,
        capabilities: ['ops.monitor', 'ops.lock', 'ops.kill', 'ops.explain.pro'],
        plugins: ['p-sql-monitor'],
    },
    {
        id: 'pack.datagen',
        category: 'capability',
        tone: 'emerald',
        order: 70,
        capabilities: ['datagen.fake'],
        plugins: ['p-fake-data'],
    },
    {
        id: 'pack.security',
        category: 'capability',
        tone: 'amber',
        order: 80,
        capabilities: ['security.export.mask', 'security.audit.pro', 'security.webhook'],
        plugins: ['p-export-mask'],
    },
    {
        id: 'pack.connector.enterprise',
        category: 'connector',
        tone: 'indigo',
        order: 110,
        capabilities: ['connector.enterprise'],
    },
    {
        id: 'pack.connector.domestic',
        category: 'connector',
        tone: 'violet',
        order: 120,
        featured: true,
        capabilities: ['connector.domestic'],
    },
    {
        id: 'pack.connector.bigdata',
        category: 'connector',
        tone: 'sky',
        order: 130,
        capabilities: ['connector.bigdata'],
    },
] as const

export const SUITE_CATALOG: readonly SuiteDefinition[] = [
    {
        id: 'suite.pro',
        packIds: ['pack.ai', 'pack.governance'],
        priceTier: 1,
        recommended: true,
    },
    {
        id: 'suite.enterprise',
        packIds: [
            'pack.ai',
            'pack.governance',
            'pack.migration',
            'pack.backup',
            'pack.security',
            'pack.dataops',
            'pack.lineage',
        ],
        priceTier: 3,
    },
    {
        id: 'suite.platform',
        packIds: [
            'pack.ai',
            'pack.governance',
            'pack.migration',
            'pack.backup',
            'pack.security',
            'pack.dataops',
            'pack.lineage',
            'pack.datagen',
            'pack.connector.enterprise',
            'pack.connector.domestic',
            'pack.connector.bigdata',
        ],
        priceTier: 5,
    },
] as const

const FREE_DB_TYPES = new Set<DbType>(['mysql', 'mariadb', 'postgresql', 'sqlite'])

/** DbType → 连接器扩展包（免费四件套不在表内） */
export const DB_TYPE_PACK_MAP: Partial<Record<DbType, PackId>> = {
    oracle: 'pack.connector.enterprise',
    sqlserver: 'pack.connector.enterprise',
    db2: 'pack.connector.enterprise',
    dm: 'pack.connector.domestic',
    oceanbase: 'pack.connector.domestic',
    gaussdb: 'pack.connector.domestic',
    kingbase: 'pack.connector.domestic',
    opengauss: 'pack.connector.domestic',
    highgo: 'pack.connector.domestic',
    gbase8a: 'pack.connector.domestic',
    oscar: 'pack.connector.domestic',
    hive: 'pack.connector.bigdata',
    kafka: 'pack.connector.bigdata',
    flink: 'pack.connector.bigdata',
    clickhouse: 'pack.connector.bigdata',
    starrocks: 'pack.connector.bigdata',
    doris: 'pack.connector.bigdata',
    trino: 'pack.connector.bigdata',
    presto: 'pack.connector.bigdata',
    elasticsearch: 'pack.connector.bigdata',
    kudu: 'pack.connector.bigdata',
    yarn: 'pack.connector.bigdata',
    kubernetes: 'pack.connector.bigdata',
    redis: 'pack.connector.bigdata',
    mongodb: 'pack.connector.bigdata',
    tidb: 'pack.connector.domestic',
    tdengine: 'pack.connector.bigdata',
    kylin: 'pack.connector.bigdata',
    phoenix: 'pack.connector.bigdata',
    greenplum: 'pack.connector.enterprise',
    sybase: 'pack.connector.enterprise',
    cachedb: 'pack.connector.enterprise',
    h2: 'pack.connector.enterprise',
    hsql: 'pack.connector.enterprise',
}

export function findPackDefinition(id: PackId): PackDefinition | undefined {
    return PACK_CATALOG.find((pack) => pack.id === id)
}

export function resolvePackForDbType(dbType: DbType): PackId | null {
    if (FREE_DB_TYPES.has(dbType)) return null
    return DB_TYPE_PACK_MAP[dbType] ?? null
}

export function isFreeDbType(dbType: DbType): boolean {
    return FREE_DB_TYPES.has(dbType)
}

export function packIdsInSuite(suiteId: SuiteDefinition['id']): readonly PackId[] {
    return SUITE_CATALOG.find((suite) => suite.id === suiteId)?.packIds ?? []
}

/** p-* 细开关 → 商业 Pack（商店门禁联动） */
export const PLUGIN_PACK_MAP: Partial<Record<string, PackId>> = {
    'p-schema-compare': 'pack.governance',
    'p-cross-env-compare': 'pack.governance',
    'p-result-diff': 'pack.governance',
    'p-sql-monitor': 'pack.dataops',
    'p-fake-data': 'pack.datagen',
    'p-export-mask': 'pack.security',
    'p-ai-workbench': 'pack.ai',
    'p-console-ai': 'pack.ai',
    'p-ai-sql-fix': 'pack.ai',
    'p-ai-result-summary': 'pack.ai',
    'p-ai-explain': 'pack.ai',
    'p-ai-index-suggest': 'pack.ai',
    'p-migration-tasks': 'pack.migration',
    'p-export-progress': 'pack.migration',
}

export function resolvePackForPlugin(pluginId: string): PackId | null {
    return PLUGIN_PACK_MAP[pluginId] ?? null
}
