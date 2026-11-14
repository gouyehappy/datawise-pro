/**
 * 数据源能力矩阵：与后端 ConnectorCapability 枚举名对齐。
 *
 * 解析顺序：1) /api/datasources catalog（capabilities[]） 2) 本文件静态 fallback。
 * 会话/锁/在线 DDL 等合并能力以 catalog 为准；勿在前端另维护第三套 dbType 名单。
 */
import type {DbType} from '@/core/types'
import type {ContextMenuItem} from '@/core/types'
import type {DatasourceDefinition} from '@/shared/api/datasource.types'
import {CONNECTOR_CAPABILITY} from '@/shared/capabilities/capability-keys'
import type {ConnectorCapabilityName} from '@/shared/capabilities/capability-keys'
import {CONNECTION_CAPABILITY_MATRIX} from '@/shared/capabilities/generated/connection-capability-matrix'

export interface DbTypeCapability {
    /** 是否可在连接向导中创建并正常使用 */
    supported: boolean
    /** 是否支持表右键 CSV 导入（INSERT 生成） */
    csvImport: boolean
    /** 是否支持 SQL 控制台执行 */
    sqlExecute: boolean
    /** 是否支持 EXPLAIN / 执行计划 */
    sqlExplain: boolean
    /** 是否支持活跃会话列表 */
    sessionMonitor: boolean
    /** 是否支持终止会话 */
    sessionKill: boolean
    /** 是否支持锁等待监控 */
    lockMonitor: boolean
    /** 是否支持在线 DDL 相关能力（后续 B/C 项使用） */
    onlineDdl: boolean
    /** SSH 跳板（JDBC 数据源经 catalog 或 fallback 启用） */
    sshTunnel: boolean
    /** 远程 Shell（SSH 连接器等） */
    remoteShell: boolean
}

const DEFAULT_CAPABILITY: DbTypeCapability = {
    supported: false,
    csvImport: false,
    sqlExecute: false,
    sqlExplain: false,
    sessionMonitor: false,
    sessionKill: false,
    lockMonitor: false,
    onlineDdl: false,
    sshTunnel: false,
    remoteShell: false,
}

function jdbcSql(dbType: DbType): DbTypeCapability {
    const sessionOps = dbType === 'mysql'
        || dbType === 'mariadb'
        || dbType === 'postgresql'
        || dbType === 'kingbase'
        || dbType === 'greenplum'
        || dbType === 'opengauss'
        || dbType === 'gaussdb'
        || dbType === 'oracle'
        || dbType === 'dm'
        || dbType === 'sqlserver'
        || dbType === 'doris'
        || dbType === 'starrocks'
        || dbType === 'gbase8a'
    const onlineDdl = dbType === 'mysql'
        || dbType === 'mariadb'
        || dbType === 'postgresql'
        || dbType === 'kingbase'
        || dbType === 'greenplum'
        || dbType === 'opengauss'
        || dbType === 'gaussdb'
        || dbType === 'oracle'
        || dbType === 'dm'
        || dbType === 'gbase8a'
        || dbType === 'sqlserver'

    return {
        supported: dbType === 'mysql'
            || dbType === 'mariadb'
            || dbType === 'postgresql'
            || dbType === 'kingbase'
            || dbType === 'greenplum'
            || dbType === 'opengauss'
            || dbType === 'gaussdb'
            || dbType === 'oracle'
            || dbType === 'dm'
            || dbType === 'sqlserver'
            || dbType === 'trino'
            || dbType === 'starrocks'
            || dbType === 'doris'
            || dbType === 'gbase8a'
            || dbType === 'redis'
            || dbType === 'mongodb',
        csvImport: dbType === 'mysql'
            || dbType === 'mariadb'
            || dbType === 'postgresql'
            || dbType === 'kingbase'
            || dbType === 'greenplum'
            || dbType === 'opengauss'
            || dbType === 'gaussdb'
            || dbType === 'oracle'
            || dbType === 'dm'
            || dbType === 'gbase8a'
            || dbType === 'sqlserver',
        sqlExecute: true,
        sqlExplain: true,
        sessionMonitor: sessionOps,
        sessionKill: sessionOps,
        lockMonitor: sessionOps,
        onlineDdl,
        sshTunnel: true,
        remoteShell: false,
    }
}

/** 各数据源能力矩阵；未列出的类型使用 DEFAULT_CAPABILITY */
export const DB_TYPE_CAPABILITIES: Partial<Record<DbType, DbTypeCapability>> = {
    mysql: jdbcSql('mysql'),
    mariadb: jdbcSql('mariadb'),
    postgresql: jdbcSql('postgresql'),
    oracle: {...jdbcSql('oracle'), csvImport: true},
    sqlserver: jdbcSql('sqlserver'),
    clickhouse: {
        supported: true,
        csvImport: false,
        sqlExecute: true,
        sqlExplain: true,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: true,
        remoteShell: false,
    },
    elasticsearch: {
        supported: true,
        csvImport: false,
        /** SQL console remains available via x-pack JDBC. */
        sqlExecute: true,
        sqlExplain: true,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: true,
        /** REST console is exposed via explorerUi + NATIVE_COMMAND-like flows. */
        remoteShell: false,
    },
    kylin: {
        supported: true,
        csvImport: false,
        sqlExecute: true,
        sqlExplain: true,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: true,
        remoteShell: false,
    },
    dm: jdbcSql('dm'),
    gaussdb: jdbcSql('gaussdb'),
    oscar: jdbcSql('oscar'),
    presto: {
        supported: true,
        csvImport: false,
        sqlExecute: true,
        sqlExplain: true,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: false,
        remoteShell: false,
    },
    trino: {
        supported: true,
        csvImport: false,
        sqlExecute: true,
        sqlExplain: true,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: false,
        remoteShell: false,
    },
    db2: {
        supported: true,
        csvImport: false,
        sqlExecute: true,
        sqlExplain: true,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: false,
        remoteShell: false,
    },
    sqlite: {
        supported: true,
        csvImport: false,
        sqlExecute: true,
        sqlExplain: true,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: false,
        remoteShell: false,
    },
    hive: {
        supported: true,
        csvImport: false,
        sqlExecute: true,
        sqlExplain: true,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: true,
        remoteShell: false,
    },
    kudu: {
        supported: true,
        csvImport: false,
        sqlExecute: false,
        sqlExplain: false,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: false,
        remoteShell: false,
    },
    oceanbase: {
        supported: true,
        csvImport: true,
        sqlExecute: true,
        sqlExplain: true,
        sessionMonitor: true,
        sessionKill: true,
        lockMonitor: true,
        onlineDdl: false,
        sshTunnel: true,
        remoteShell: false,
    },
    kingbase: jdbcSql('kingbase'),
    greenplum: jdbcSql('greenplum'),
    opengauss: jdbcSql('opengauss'),
    highgo: jdbcSql('highgo'),
    gbase8a: jdbcSql('gbase8a'),
    tidb: jdbcSql('tidb'),
    tdengine: jdbcSql('tdengine'),
    sybase: jdbcSql('sybase'),
    phoenix: jdbcSql('phoenix'),
    cachedb: jdbcSql('cachedb'),
    h2: jdbcSql('h2'),
    hsql: jdbcSql('hsql'),
    flink: {
        supported: true,
        csvImport: false,
        sqlExecute: true,
        sqlExplain: true,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: false,
        remoteShell: false,
    },
    redis: {
        supported: true,
        csvImport: false,
        sqlExecute: false,
        sqlExplain: false,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: false,
        remoteShell: false,
    },
    kafka: DEFAULT_CAPABILITY,
    yarn: DEFAULT_CAPABILITY,
    jenkins: DEFAULT_CAPABILITY,
    nacos: DEFAULT_CAPABILITY,
    polaris: DEFAULT_CAPABILITY,
    kubernetes: DEFAULT_CAPABILITY,
    ssh: {
        supported: true,
        csvImport: false,
        sqlExecute: false,
        sqlExplain: false,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: false,
        remoteShell: true,
    },
    mongodb: {
        supported: true,
        csvImport: false,
        sqlExecute: false,
        sqlExplain: false,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: false,
        remoteShell: false,
    },
    starrocks: jdbcSql('starrocks'),
    doris: jdbcSql('doris'),
    dameng: jdbcSql('dm'),
    generic: {
        supported: true,
        csvImport: false,
        sqlExecute: true,
        sqlExplain: false,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: true,
        remoteShell: false,
    },
    other: {
        supported: true,
        csvImport: false,
        sqlExecute: true,
        sqlExplain: false,
        sessionMonitor: false,
        sessionKill: false,
        lockMonitor: false,
        onlineDdl: false,
        sshTunnel: true,
        remoteShell: false,
    },
}

function canonicalDbType(dbType: DbType): DbType {
    return dbType === 'dameng' ? 'dm' : dbType
}

export function getDbTypeCapability(dbType: DbType): DbTypeCapability {
    const key = canonicalDbType(dbType)
    return DB_TYPE_CAPABILITIES[key] ?? DEFAULT_CAPABILITY
}

function resolveCatalogCapability(
    dbType: DbType,
    capability: ConnectorCapabilityName,
    catalog?: readonly DatasourceDefinition[],
): boolean | undefined {
    const fromCatalog = catalog?.find((item) => item.id === dbType)
    if (fromCatalog?.capabilities?.length) {
        return fromCatalog.capabilities.includes(capability)
    }
    return undefined
}

/** catalog 有值则用 API；否则回退 {@link DB_TYPE_CAPABILITIES}。 */
function resolveFlag(
    dbType: DbType | undefined,
    catalog: readonly DatasourceDefinition[] | undefined,
    catalogKey: ConnectorCapabilityName,
    matrixKey: keyof DbTypeCapability,
): boolean {
    if (!dbType) return false
    const fromCatalog = resolveCatalogCapability(dbType, catalogKey, catalog)
    if (fromCatalog !== undefined) return fromCatalog
    return getDbTypeCapability(dbType)[matrixKey]
}

function filterContextMenuItemsByIds(
    items: ContextMenuItem[],
    blockedIds: ReadonlySet<string>,
): ContextMenuItem[] {
    return items
        .filter((item) => !blockedIds.has(item.id))
        .map((item) => {
            if (!item.children?.length) return item
            const children = filterContextMenuItemsByIds(item.children, blockedIds)
            return children.length ? {...item, children} : null
        })
        .filter((item): item is ContextMenuItem => item != null)
}

export function isDbTypeSupported(dbType: DbType): boolean {
    return getDbTypeCapability(dbType).supported
}

/** CSV 导入生成 INSERT；catalog 有 DML 条目时以其为准，否则回退静态 csvImport。 */
export function isCsvImportSupported(
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): boolean {
    if (!dbType) return false
    const fromCatalog = resolveCatalogCapability(dbType, CONNECTOR_CAPABILITY.DML, catalog)
    if (fromCatalog !== undefined) return fromCatalog
    return getDbTypeCapability(dbType).csvImport
}

export function supportsSqlExecute(
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): boolean {
    return resolveFlag(dbType, catalog, CONNECTOR_CAPABILITY.SQL_EXECUTE, 'sqlExecute')
}

export function supportsTableMutation(
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): boolean {
    if (!dbType) return false
    const fromCatalog = resolveCatalogCapability(dbType, CONNECTOR_CAPABILITY.DML, catalog)
    if (fromCatalog !== undefined) return fromCatalog
    return getDbTypeCapability(dbType).sqlExecute
}

export function supportsSqlExplain(
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): boolean {
    return resolveFlag(dbType, catalog, CONNECTOR_CAPABILITY.SQL_EXPLAIN, 'sqlExplain')
}

export function supportsSessionMonitor(
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): boolean {
    return resolveFlag(dbType, catalog, CONNECTOR_CAPABILITY.SESSION_MONITOR, 'sessionMonitor')
}

export function supportsSessionKill(
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): boolean {
    return resolveFlag(dbType, catalog, CONNECTOR_CAPABILITY.SESSION_KILL, 'sessionKill')
}

export function supportsLockMonitor(
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): boolean {
    return resolveFlag(dbType, catalog, CONNECTOR_CAPABILITY.LOCK_MONITOR, 'lockMonitor')
}

export function supportsOnlineDdl(
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): boolean {
    return resolveFlag(dbType, catalog, CONNECTOR_CAPABILITY.ONLINE_DDL, 'onlineDdl')
}

export function supportsSshTunnel(
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): boolean {
    if (dbType === 'ssh') return false
    return resolveFlag(dbType, catalog, CONNECTOR_CAPABILITY.SSH_TUNNEL, 'sshTunnel')
}

export function supportsRemoteShell(
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): boolean {
    return resolveFlag(dbType, catalog, CONNECTOR_CAPABILITY.REMOTE_SHELL, 'remoteShell')
}

const SQL_CONTEXT_MENU_IDS = new Set([
    'console',
    'sql-editor',
    'sql-editor-open',
    'sql-editor-recent',
    'sql-editor-new',
    'sql-editor-console',
    'run-sql-file',
    'restore-wizard',
])

const DML_CONTEXT_MENU_IDS = new Set([
    'truncate',
    'migrate-data',
    'copy-table',
    'copy-structure',
    'copy-data',
    'export-sql',
    'export-structure',
    'export-all',
    'export-wizard',
    'backup-wizard',
    'schema-compare',
    'cross-env-compare',
    'delete',
])

/** 非 JDBC 数据源隐藏 SQL 控制台相关菜单项 */
export function filterSqlContextMenuItems(
    items: ContextMenuItem[],
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): ContextMenuItem[] {
    if (supportsSqlExecute(dbType, catalog)) return items
    return filterContextMenuItemsByIds(items, SQL_CONTEXT_MENU_IDS)
}

/** 非 DML 数据源隐藏表/库级 DDL、迁移、导出 SQL 等菜单项 */
export function filterDmlContextMenuItems(
    items: ContextMenuItem[],
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): ContextMenuItem[] {
    if (supportsTableMutation(dbType, catalog)) return items
    return filterContextMenuItemsByIds(items, DML_CONTEXT_MENU_IDS)
}

/** 按连接器 SPI 能力裁剪 Explorer 右键菜单（SQL 控制台 + DML/DDL） */
export function filterConnectionCapabilityMenuItems(
    items: ContextMenuItem[],
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): ContextMenuItem[] {
    return filterDmlContextMenuItems(
        filterSqlContextMenuItems(items, dbType, catalog),
        dbType,
        catalog,
    )
}

/** 供产品矩阵过滤复用的菜单裁剪 */
export function filterContextMenuByIds(
    items: ContextMenuItem[],
    blockedIds: ReadonlySet<string>,
): ContextMenuItem[] {
    return filterContextMenuItemsByIds(items, blockedIds)
}

export interface ConnectionCapabilitiesSnapshot {
    sqlExecute: boolean
    sqlExplain: boolean
    sessionMonitor: boolean
    sessionKill: boolean
    lockMonitor: boolean
    onlineDdl: boolean
    sshTunnel: boolean
    tableMutation: boolean
    /** 产品矩阵（T-CAP-1） */
    visualQueryBuilder: boolean
    diagram: boolean
    schemaCompare: boolean
    transactionalDdl: boolean
    specializedSurface: boolean
}

function productProfileFeatures(dbType: DbType | undefined) {
    if (!dbType) {
        return {
            visualQueryBuilder: false,
            diagram: false,
            schemaCompare: false,
            transactionalDdl: false,
            specializedSurface: false,
        }
    }
    const key = dbType === 'dameng' ? 'dm' : dbType
    const profile = CONNECTION_CAPABILITY_MATRIX.types[key]
    if (!profile) {
        return {
            visualQueryBuilder: false,
            diagram: false,
            schemaCompare: false,
            transactionalDdl: false,
            specializedSurface: false,
        }
    }
    return {
        visualQueryBuilder: profile.features.visualQueryBuilder,
        diagram: profile.features.diagram,
        schemaCompare: profile.features.schemaCompare,
        transactionalDdl: profile.features.transactionalDdl,
        specializedSurface: profile.specializedSurface,
    }
}

export function buildConnectionCapabilities(
    dbType: DbType | undefined,
    catalog?: readonly DatasourceDefinition[],
): ConnectionCapabilitiesSnapshot {
    const product = productProfileFeatures(dbType)
    return {
        sqlExecute: supportsSqlExecute(dbType, catalog),
        sqlExplain: supportsSqlExplain(dbType, catalog),
        sessionMonitor: supportsSessionMonitor(dbType, catalog),
        sessionKill: supportsSessionKill(dbType, catalog),
        lockMonitor: supportsLockMonitor(dbType, catalog),
        onlineDdl: supportsOnlineDdl(dbType, catalog),
        sshTunnel: supportsSshTunnel(dbType, catalog),
        tableMutation: supportsTableMutation(dbType, catalog),
        visualQueryBuilder: product.visualQueryBuilder && supportsSqlExecute(dbType, catalog),
        diagram: product.diagram && supportsSqlExecute(dbType, catalog),
        schemaCompare: product.schemaCompare && supportsTableMutation(dbType, catalog),
        transactionalDdl: product.transactionalDdl,
        specializedSurface: product.specializedSurface,
    }
}
