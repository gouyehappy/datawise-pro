import type {DbType} from '@/core/types'
import {ALL_DB_TYPES} from '@/features/connection/constants/db-types'

const ALIASES: Record<string, DbType> = {
    mysql: 'mysql',
    mariadb: 'mariadb',
    postgresql: 'postgresql',
    postgres: 'postgresql',
    pgsql: 'postgresql',
    oracle: 'oracle',
    sqlserver: 'sqlserver',
    mssql: 'sqlserver',
    'sql server': 'sqlserver',
    clickhouse: 'clickhouse',
    mongodb: 'mongodb',
    mongo: 'mongodb',
    redis: 'redis',
    sqlite: 'sqlite',
    hive: 'hive',
    db2: 'db2',
    dm: 'dm',
    dameng: 'dm',
    starrocks: 'starrocks',
    doris: 'doris',
    tidb: 'tidb',
    trino: 'trino',
    presto: 'presto',
    elasticsearch: 'elasticsearch',
    greenplum: 'greenplum',
    opengauss: 'opengauss',
    gaussdb: 'gaussdb',
    oceanbase: 'oceanbase',
    kingbase: 'kingbase',
    h2: 'h2',
    hsql: 'hsql',
    hsqldb: 'hsql',
    sybase: 'sybase',
    generic: 'generic',
    other: 'other',
}

const NAVICAT_NUMERIC: Record<string, DbType> = {
    '1': 'mysql',
    '2': 'postgresql',
    '3': 'sqlite',
    '4': 'oracle',
    '5': 'mariadb',
    '7': 'sqlserver',
    '8': 'mongodb',
    '9': 'redis',
}

const known = new Set<string>(ALL_DB_TYPES)

export function resolveDbType(raw: string | undefined | null): DbType | null {
    if (raw == null) return null
    const key = String(raw).trim().toLowerCase()
    if (!key) return null
    if (NAVICAT_NUMERIC[key]) return NAVICAT_NUMERIC[key]
    if (ALIASES[key]) return ALIASES[key]
    if (known.has(key)) return key as DbType
    // driver-ref style: mysql.8 / postgres-jdbc
    const prefix = key.split(/[._-]/)[0]
    if (ALIASES[prefix]) return ALIASES[prefix]
    if (known.has(prefix)) return prefix as DbType
    return null
}
