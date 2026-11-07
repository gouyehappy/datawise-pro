/**
 * 连接类型场景分类（对标 DBX driver-category-definitions）。
 * 每个 DbType 必须落在某一分类；CI / 单测用 assertDbTypeCategoriesComplete 防漏网。
 */
import type {DbType} from '@/core/types'

export type DbTypeCategoryKey =
    | 'sql'
    | 'analytics'
    | 'domestic'
    | 'lightweight'
    | 'document'
    | 'timeseries'
    | 'mq'
    | 'registry_config'
    | 'ops'
    | 'plugins'

export interface DbTypeCategoryDef {
    key: DbTypeCategoryKey
    /** i18n key under explorer.* */
    titleKey: string
    order: number
}

export const DB_TYPE_CATEGORIES: readonly DbTypeCategoryDef[] = [
    {key: 'sql', titleKey: 'explorer.dbTypeCategorySql', order: 1},
    {key: 'analytics', titleKey: 'explorer.dbTypeCategoryAnalytics', order: 2},
    {key: 'domestic', titleKey: 'explorer.dbTypeCategoryDomestic', order: 3},
    {key: 'lightweight', titleKey: 'explorer.dbTypeCategoryLightweight', order: 4},
    {key: 'document', titleKey: 'explorer.dbTypeCategoryDocument', order: 5},
    {key: 'timeseries', titleKey: 'explorer.dbTypeCategoryTimeseries', order: 6},
    {key: 'mq', titleKey: 'explorer.dbTypeCategoryMq', order: 7},
    {key: 'registry_config', titleKey: 'explorer.dbTypeCategoryRegistryConfig', order: 8},
    {key: 'ops', titleKey: 'explorer.dbTypeCategoryOps', order: 9},
    {key: 'plugins', titleKey: 'explorer.dbTypeCategoryPlugins', order: 10},
] as const

/** 显式映射：新增 DbType 时必须补一行 */
export const DB_TYPE_CATEGORY_MAP: Readonly<Record<DbType, DbTypeCategoryKey>> = {
    mysql: 'sql',
    mariadb: 'sql',
    postgresql: 'sql',
    oracle: 'sql',
    sqlserver: 'sql',
    db2: 'sql',
    sybase: 'sql',
    greenplum: 'sql',
    generic: 'sql',
    other: 'sql',

    clickhouse: 'analytics',
    hive: 'analytics',
    trino: 'analytics',
    presto: 'analytics',
    starrocks: 'analytics',
    doris: 'analytics',
    kylin: 'analytics',
    kudu: 'analytics',
    phoenix: 'analytics',
    flink: 'analytics',

    dm: 'domestic',
    dameng: 'domestic',
    oscar: 'domestic',
    kingbase: 'domestic',
    opengauss: 'domestic',
    gaussdb: 'domestic',
    oceanbase: 'domestic',
    tidb: 'domestic',
    highgo: 'domestic',
    gbase8a: 'domestic',

    sqlite: 'lightweight',
    h2: 'lightweight',
    hsql: 'lightweight',
    cachedb: 'lightweight',

    mongodb: 'document',
    redis: 'document',
    elasticsearch: 'document',

    tdengine: 'timeseries',

    kafka: 'mq',

    nacos: 'registry_config',
    polaris: 'registry_config',

    yarn: 'ops',
    jenkins: 'ops',
    kubernetes: 'ops',
    ssh: 'ops',

    plugin: 'plugins',
}

export function categoryForDbType(dbType: DbType): DbTypeCategoryKey {
    return DB_TYPE_CATEGORY_MAP[dbType] ?? 'sql'
}

export function assertDbTypeCategoriesComplete(dbTypes: readonly string[]): void {
    const mapped = new Set(Object.keys(DB_TYPE_CATEGORY_MAP))
    const missing = dbTypes.filter((id) => !mapped.has(id))
    const validKeys = new Set(DB_TYPE_CATEGORIES.map((c) => c.key))
    const bad = Object.entries(DB_TYPE_CATEGORY_MAP)
        .filter(([, cat]) => !validKeys.has(cat))
        .map(([id, cat]) => `${id}->${cat}`)

    if (missing.length || bad.length) {
        const parts: string[] = []
        if (missing.length) parts.push(`unmapped=${missing.join(',')}`)
        if (bad.length) parts.push(`unknownCategories=${bad.join(',')}`)
        throw new Error(`Invalid db type categories: ${parts.join('; ')}`)
    }
}
