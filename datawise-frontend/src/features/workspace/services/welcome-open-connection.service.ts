import type {DbType} from '@/core/types'
import type {PlatformConnectionMenuOpen} from '@/features/explorer/services/explorer-platform-menu-actions.service'

export type WelcomePrimaryOpenTarget =
    | {mode: 'plugin'}
    | {mode: 'platform'; open: PlatformConnectionMenuOpen}
    | {mode: 'mongo'}
    | {mode: 'sql'}
    | {mode: 'connect'}

/** 工具型连接的首页默认入口（对齐侧栏「打开工作台」） */
const PLATFORM_PRIMARY_OPEN: Partial<Record<DbType, PlatformConnectionMenuOpen>> = {
    ssh: {kind: 'ssh-terminal'},
    redis: {kind: 'redis-console', view: 'keys'},
    kafka: {kind: 'kafka-topics'},
    elasticsearch: {kind: 'elasticsearch-console', view: 'documents'},
    yarn: {kind: 'yarn-applications'},
    jenkins: {kind: 'jenkins-jobs'},
    nacos: {kind: 'nacos-configs'},
    polaris: {kind: 'polaris-services'},
    kubernetes: {kind: 'k8s-pods'},
}

/** JDBC / SQL 控制台型（elasticsearch 已在 PLATFORM 优先） */
const SQL_CONSOLE_DB_TYPES = new Set<DbType>([
    'mysql',
    'mariadb',
    'postgresql',
    'oracle',
    'sqlserver',
    'sqlite',
    'h2',
    'hsql',
    'hive',
    'clickhouse',
    'doris',
    'starrocks',
    'tidb',
    'oceanbase',
    'dm',
    'dameng',
    'gaussdb',
    'opengauss',
    'greenplum',
    'kingbase',
    'highgo',
    'gbase8a',
    'oscar',
    'db2',
    'sybase',
    'presto',
    'trino',
    'kylin',
    'phoenix',
    'cachedb',
    'tdengine',
    'generic',
])

/**
 * 欢迎页 / 底栏快启点击目标：
 * 工具型连接进主工作台；elasticsearch 虽支持 SQL，也优先进文档工作台。
 */
export function resolveWelcomePrimaryOpen(dbType: DbType): WelcomePrimaryOpenTarget {
    if (dbType === 'plugin') return {mode: 'plugin'}
    if (dbType === 'mongodb') return {mode: 'mongo'}

    const platform = PLATFORM_PRIMARY_OPEN[dbType]
    if (platform) return {mode: 'platform', open: platform}

    if (SQL_CONSOLE_DB_TYPES.has(dbType)) return {mode: 'sql'}
    return {mode: 'connect'}
}
