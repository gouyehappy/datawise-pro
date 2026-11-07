import type {DbType, TableRow} from '@/core/types'

const MYSQL_FAMILY = new Set<DbType>([
    'mysql',
    'mariadb',
    'oceanbase',
    'tidb',
    'gbase8a',
])

const POSTGRES_FAMILY = new Set<DbType>([
    'postgresql',
    'kingbase',
    'greenplum',
    'opengauss',
    'gaussdb',
])

export type AdminDiagnosisKind = 'privileges' | 'storage'

export interface AdminDiagnosisQuery {
    sql: string
    /** i18n hint key under shortcut.adminDiagnosis.hints.* */
    hintKey: string
}

export interface AdminPrivilegeRow {
    principal: string
    scope: string
    privilege: string
    grantable: string
}

export interface AdminStorageRow {
    objectName: string
    engine: string
    rowEstimate: string
    totalSize: string
    dataSize: string
    indexSize: string
}

export function supportsAdminPrivileges(dbType?: DbType): boolean {
    return !!dbType && (MYSQL_FAMILY.has(dbType) || POSTGRES_FAMILY.has(dbType))
}

export function supportsAdminStorage(dbType?: DbType): boolean {
    return !!dbType && (MYSQL_FAMILY.has(dbType) || POSTGRES_FAMILY.has(dbType))
}

export function supportsAdminMaintenance(dbType?: DbType): boolean {
    return supportsAdminStorage(dbType)
}

export function buildAdminPrivilegesQuery(dbType?: DbType): AdminDiagnosisQuery | null {
    if (!dbType) return null
    if (MYSQL_FAMILY.has(dbType)) {
        return {
            sql: [
                'SELECT principal, scope_schema, scope_object, privilege_type, is_grantable',
                'FROM (',
                '  SELECT GRANTEE AS principal,',
                "    '*' AS scope_schema,",
                "    '*' AS scope_object,",
                '    PRIVILEGE_TYPE AS privilege_type,',
                '    IS_GRANTABLE AS is_grantable',
                '  FROM information_schema.USER_PRIVILEGES',
                '  UNION ALL',
                "  SELECT GRANTEE, TABLE_SCHEMA, '*', PRIVILEGE_TYPE, IS_GRANTABLE",
                '  FROM information_schema.SCHEMA_PRIVILEGES',
                '  WHERE TABLE_SCHEMA = DATABASE()',
                '  UNION ALL',
                '  SELECT GRANTEE, TABLE_SCHEMA, TABLE_NAME, PRIVILEGE_TYPE, IS_GRANTABLE',
                '  FROM information_schema.TABLE_PRIVILEGES',
                '  WHERE TABLE_SCHEMA = DATABASE()',
                ') AS privilege_rows',
                'ORDER BY principal, scope_schema, scope_object, privilege_type',
                'LIMIT 500',
            ].join('\n'),
            hintKey: 'mysqlPrivileges',
        }
    }
    if (POSTGRES_FAMILY.has(dbType)) {
        return {
            sql: [
                'SELECT r.rolname AS principal,',
                "  CASE WHEN r.rolsuper THEN 'superuser' ELSE 'role' END AS scope_schema,",
                "  CASE",
                "    WHEN r.rolcanlogin THEN 'login'",
                "    ELSE 'nologin'",
                '  END AS scope_object,',
                "  CONCAT_WS(',',",
                "    CASE WHEN r.rolcreatedb THEN 'CREATEDB' END,",
                "    CASE WHEN r.rolcreaterole THEN 'CREATEROLE' END,",
                "    CASE WHEN r.rolreplication THEN 'REPLICATION' END",
                "  ) AS privilege_type,",
                "  CASE WHEN r.rolsuper THEN 'YES' ELSE 'NO' END AS is_grantable",
                'FROM pg_roles r',
                'ORDER BY r.rolname',
                'LIMIT 200',
            ].join('\n'),
            hintKey: 'postgresPrivileges',
        }
    }
    return null
}

export function buildAdminStorageQuery(dbType?: DbType): AdminDiagnosisQuery | null {
    if (!dbType) return null
    if (MYSQL_FAMILY.has(dbType)) {
        return {
            sql: [
                'SELECT TABLE_NAME AS object_name,',
                '  COALESCE(ENGINE, \'\') AS engine,',
                '  COALESCE(TABLE_ROWS, 0) AS row_estimate,',
                '  ROUND((COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0)) / 1024 / 1024, 2) AS total_mb,',
                '  ROUND(COALESCE(DATA_LENGTH, 0) / 1024 / 1024, 2) AS data_mb,',
                '  ROUND(COALESCE(INDEX_LENGTH, 0) / 1024 / 1024, 2) AS index_mb',
                'FROM information_schema.TABLES',
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
                'ORDER BY (COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0)) DESC',
                'LIMIT 100',
            ].join('\n'),
            hintKey: 'mysqlStorage',
        }
    }
    if (POSTGRES_FAMILY.has(dbType)) {
        return {
            sql: [
                'SELECT c.relname AS object_name,',
                "  CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned' ELSE c.relkind::text END AS engine,",
                '  COALESCE(s.n_live_tup, 0) AS row_estimate,',
                '  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,',
                '  pg_size_pretty(pg_relation_size(c.oid)) AS data_size,',
                '  pg_size_pretty(pg_indexes_size(c.oid)) AS index_size',
                'FROM pg_class c',
                'JOIN pg_namespace n ON n.oid = c.relnamespace',
                'LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid',
                "WHERE c.relkind IN ('r', 'p')",
                "  AND n.nspname = current_schema()",
                'ORDER BY pg_total_relation_size(c.oid) DESC',
                'LIMIT 100',
            ].join('\n'),
            hintKey: 'postgresStorage',
        }
    }
    return null
}

/** 维护入口：生成只读诊断旁的建议 SQL（打开控制台，不自动执行） */
export function buildAdminMaintenanceSql(
    dbType: DbType | undefined,
    objectName: string,
): string | null {
    const name = objectName.trim()
    if (!name || !dbType) return null
    if (MYSQL_FAMILY.has(dbType)) {
        return [
            `-- Maintenance for ${name}`,
            `ANALYZE TABLE \`${name.replace(/`/g, '``')}\`;`,
            `-- OPTIMIZE TABLE \`${name.replace(/`/g, '``')}\`;`,
        ].join('\n')
    }
    if (POSTGRES_FAMILY.has(dbType)) {
        const quoted = `"${name.replace(/"/g, '""')}"`
        return [
            `-- Maintenance for ${name}`,
            `VACUUM (ANALYZE) ${quoted};`,
            `-- REINDEX TABLE ${quoted};`,
        ].join('\n')
    }
    return null
}

function cell(row: TableRow, ...keys: string[]): string {
    for (const key of keys) {
        const found = Object.entries(row).find(([k]) => k.toLowerCase() === key.toLowerCase())
        if (found && found[1] != null && String(found[1]).trim() !== '') {
            return String(found[1])
        }
    }
    return ''
}

export function parseAdminPrivilegeRows(rows: TableRow[]): AdminPrivilegeRow[] {
    return rows.map((row) => {
        const schema = cell(row, 'scope_schema', 'table_schema')
        const object = cell(row, 'scope_object', 'table_name')
        const scope = [schema, object].filter(Boolean).join('.') || '—'
        return {
            principal: cell(row, 'principal', 'grantee', 'rolname') || '—',
            scope,
            privilege: cell(row, 'privilege_type', 'privilege') || '—',
            grantable: cell(row, 'is_grantable', 'grantable') || '—',
        }
    })
}

export function parseAdminStorageRows(rows: TableRow[], dbType?: DbType): AdminStorageRow[] {
    const pg = dbType ? POSTGRES_FAMILY.has(dbType) : false
    return rows.map((row) => ({
        objectName: cell(row, 'object_name', 'table_name', 'relname') || '—',
        engine: cell(row, 'engine') || '—',
        rowEstimate: cell(row, 'row_estimate', 'table_rows', 'n_live_tup') || '—',
        totalSize: pg
            ? cell(row, 'total_size') || '—'
            : formatMb(cell(row, 'total_mb')),
        dataSize: pg
            ? cell(row, 'data_size') || '—'
            : formatMb(cell(row, 'data_mb')),
        indexSize: pg
            ? cell(row, 'index_size') || '—'
            : formatMb(cell(row, 'index_mb')),
    }))
}

function formatMb(raw: string): string {
    if (!raw.trim()) return '—'
    const num = Number(raw)
    if (!Number.isFinite(num)) return raw
    return `${num} MB`
}
