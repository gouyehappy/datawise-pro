/** Lightweight JDBC URL host/port/database extraction for import mappers. */

export interface JdbcUrlParts {
    scheme?: string
    host: string
    port: string
    database: string
}

export function parseJdbcUrlParts(url: string | undefined | null): JdbcUrlParts | null {
    const raw = url?.trim()
    if (!raw) return null
    const withoutJdbc = raw.replace(/^jdbc:/i, '')
    // oracle thin: oracle:thin:@//host:port/service or @host:port:sid
    const oracle = withoutJdbc.match(
        /^oracle:thin:@(?:\/\/)?([^:/]+)(?::(\d+))?(?:[:/]([^?;]+))?/i,
    )
    if (oracle) {
        return {
            scheme: 'oracle',
            host: oracle[1] || 'localhost',
            port: oracle[2] || '1521',
            database: decodeURIComponent((oracle[3] || '').replace(/^\//, '')),
        }
    }
    // generic: mysql://host:port/db  |  postgresql://host:port/db
    const m = withoutJdbc.match(
        /^([a-z0-9+.-]+):\/\/([^/?:;]+)(?::(\d+))?(\/([^?;]*))?/i,
    )
    if (!m) return null
    return {
        scheme: (m[1] || '').toLowerCase(),
        host: m[2] || 'localhost',
        port: m[3] || '',
        database: decodeURIComponent((m[5] || '').replace(/^\//, '')),
    }
}

export function inferDbTypeFromJdbc(url: string | undefined | null, driverRef?: string): string {
    const lowerUrl = (url ?? '').toLowerCase()
    const lowerDriver = (driverRef ?? '').toLowerCase()
    const hay = `${lowerUrl} ${lowerDriver}`
    if (hay.includes('mariadb')) return 'mariadb'
    if (hay.includes('mysql') || hay.includes('tidb')) return hay.includes('tidb') ? 'tidb' : 'mysql'
    if (hay.includes('postgres') || hay.includes('pgsql') || hay.includes('greenplum') || hay.includes('opengauss')) {
        if (hay.includes('greenplum')) return 'greenplum'
        if (hay.includes('opengauss') || hay.includes('gauss')) return 'opengauss'
        return 'postgresql'
    }
    if (hay.includes('sqlserver') || hay.includes('mssql') || hay.includes('microsoft')) return 'sqlserver'
    if (hay.includes('oracle')) return 'oracle'
    if (hay.includes('clickhouse')) return 'clickhouse'
    if (hay.includes('mongo')) return 'mongodb'
    if (hay.includes('redis')) return 'redis'
    if (hay.includes('sqlite')) return 'sqlite'
    if (hay.includes('hive')) return 'hive'
    if (hay.includes('db2')) return 'db2'
    if (hay.includes('dm') || hay.includes('dameng')) return 'dm'
    if (hay.includes('starrocks')) return 'starrocks'
    if (hay.includes('doris')) return 'doris'
    if (hay.includes('trino')) return 'trino'
    if (hay.includes('presto')) return 'presto'
    if (hay.includes('elasticsearch') || hay.includes('es:')) return 'elasticsearch'
    if (hay.includes('h2:')) return 'h2'
    return 'generic'
}
