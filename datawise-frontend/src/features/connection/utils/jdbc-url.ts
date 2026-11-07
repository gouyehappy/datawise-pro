import type {DbType} from '@/core/types'
import {formatNacosConsoleAddress} from '@/features/connection/utils/nacos-endpoint'
import {formatHttpEndpoint} from '@/features/connection/utils/http-endpoint'

function readAdvancedLine(advancedConfig: string | undefined, key: string): string | undefined {
    if (!advancedConfig?.trim()) return undefined
    const prefix = `${key}=`
    for (const line of advancedConfig.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
            return trimmed.slice(prefix.length).trim()
        }
    }
    return undefined
}

function finalizeHive2Url(
    dbType: DbType,
    url: string,
    options?: {user?: string; auth?: string; advancedConfig?: string},
): string {
    if (dbType !== 'hive') return url
    let resolved = url.replace(/;auth=LDAP/gi, '')
    if (dbType === 'hive' && !/(?:[;?&]|^)auth=/i.test(resolved)) {
        const auth = readAdvancedLine(options?.advancedConfig, 'auth')
            ?? (options?.auth && options.auth !== 'NONE' && options.user?.trim() ? 'LDAP' : undefined)
        if (auth) resolved = `${resolved};auth=${auth}`
    }
    for (const key of ['ssl', 'transportMode', 'httpPath']) {
        const value = readAdvancedLine(options?.advancedConfig, key)
        if (value && !new RegExp(`(?:[;?&]|^)${key}=`, 'i').test(resolved)) {
            resolved = `${resolved};${key}=${value}`
        }
    }
    return resolved
}

function buildHive2Url(
    dbType: DbType,
    host: string,
    port: string,
    extra?: {database?: string},
    options?: {user?: string; auth?: string; advancedConfig?: string},
): string {
    const db = extra?.database?.trim() || ''
    const base = db
        ? `jdbc:hive2://${host}:${port}/${db}`
        : `jdbc:hive2://${host}:${port}/`
    return finalizeHive2Url(dbType, base, options)
}

export function buildJdbcUrl(
    dbType: DbType,
    host: string,
    port: string,
    extra?: { sid?: string; database?: string; user?: string; auth?: string; advancedConfig?: string },
) {
    switch (dbType) {
        case 'mysql':
        case 'mariadb':
        case 'starrocks':
        case 'doris': {
            const db = extra?.database?.trim()
            return db ? `jdbc:mysql://${host}:${port}/${db}` : `jdbc:mysql://${host}:${port}/`
        }
        case 'oracle':
            return `jdbc:oracle:thin:@${host}:${port}:${extra?.sid ?? 'XE'}`
        case 'dm': {
            const db = extra?.database?.trim()
            return db ? `jdbc:dm://${host}:${port}/${db}` : `jdbc:dm://${host}:${port}`
        }
        case 'oscar': {
            const db = extra?.database?.trim()
            return db ? `jdbc:oscar://${host}:${port}/${db}` : `jdbc:oscar://${host}:${port}/OSCRDB`
        }
        case 'gbase8a': {
            const db = extra?.database?.trim()
            return db ? `jdbc:gbase://${host}:${port}/${db}` : `jdbc:gbase://${host}:${port}/`
        }
        case 'postgresql':
            return `jdbc:postgresql://${host}:${port}/postgres`
        case 'greenplum': {
            const db = extra?.database?.trim()
            return db ? `jdbc:postgresql://${host}:${port}/${db}` : `jdbc:postgresql://${host}:${port}/postgres`
        }
        case 'opengauss': {
            const db = extra?.database?.trim()
            return db ? `jdbc:opengauss://${host}:${port}/${db}` : `jdbc:opengauss://${host}:${port}/test`
        }
        case 'highgo': {
            const db = extra?.database?.trim()
            return db ? `jdbc:highgo://${host}:${port}/${db}` : `jdbc:highgo://${host}:${port}/highgo`
        }
        case 'db2': {
            const db = extra?.database?.trim()
            return db ? `jdbc:db2://${host}:${port}/${db}` : `jdbc:db2://${host}:${port}/testdb`
        }
        case 'sqlite': {
            const file = extra?.database?.trim() || host?.trim()
            return file ? `jdbc:sqlite:${file}` : 'jdbc:sqlite:/tmp/test.db'
        }
        case 'presto':
            return `jdbc:presto://${host}:${port}`
        case 'kingbase': {
            const db = extra?.database?.trim()
            return db ? `jdbc:kingbase8://${host}:${port}/${db}` : `jdbc:kingbase8://${host}:${port}/test`
        }
        case 'sqlserver': {
            const db = extra?.database?.trim()
            const base = `jdbc:sqlserver://${host}:${port}`
            return db ? `${base};DatabaseName=${db}` : base
        }
        case 'redis':
            return `jdbc:redis://${host}:${port}/`
        case 'kafka':
            return host.includes(',') ? `kafka://${host}` : `kafka://${host}:${port}`
        case 'yarn':
            return formatHttpEndpoint('yarn', host, port, extra?.advancedConfig)
        case 'jenkins':
            return formatHttpEndpoint('jenkins', host, port, extra?.advancedConfig)
        case 'nacos':
            return formatNacosConsoleAddress(host, port, extra?.advancedConfig)
        case 'polaris':
            return formatHttpEndpoint('polaris', host, port, extra?.advancedConfig)
        case 'kubernetes':
            return formatHttpEndpoint('kubernetes', host, port, extra?.advancedConfig)
        case 'mongodb': {
            const db = extra?.database?.trim()
            return db ? `mongodb://${host}:${port}/${db}` : `mongodb://${host}:${port}/`
        }
        case 'clickhouse': {
            const db = extra?.database?.trim()
            return db ? `jdbc:clickhouse://${host}:${port}/${db}` : `jdbc:clickhouse://${host}:${port}/default`
        }
        case 'elasticsearch':
            return `jdbc:es://${host}:${port}`
        case 'kylin': {
            const project = extra?.database?.trim()
            return project ? `jdbc:kylin://${host}:${port}/${project}` : `jdbc:kylin://${host}:${port}/learn_kylin`
        }
        case 'oceanbase': {
            const db = extra?.database?.trim()
            const path = db ? `/${db}` : '/test'
            return `jdbc:oceanbase://${host}:${port}${path}?pool=false&useUnicode=true&characterEncoding=utf-8&useSSL=false`
        }
        case 'tidb': {
            const db = extra?.database?.trim()
            const path = db ? `/${db}` : '/test'
            return `jdbc:mysql://${host}:${port}${path}?useUnicode=true&characterEncoding=utf-8&useSSL=false&zeroDateTimeBehavior=convertToNull&serverTimezone=Asia/Shanghai&tinyInt1isBit=false&rewriteBatchedStatements=true&useCompression=true`
        }
        case 'tdengine': {
            const db = extra?.database?.trim()
            const path = db ? `/${db}` : '/test'
            return `jdbc:TAOS-RS://${host}:${port}${path}?charset=UTF-8&locale=en_US.UTF-8&timezone=UTC+8`
        }
        case 'sybase': {
            const db = extra?.database?.trim()
            return db ? `jdbc:sybase:Tds:${host}:${port}/${db}?charset=cp936` : `jdbc:sybase:Tds:${host}:${port}/test?charset=cp936`
        }
        case 'phoenix':
            return `jdbc:phoenix:${host}:${port}`
        case 'cachedb':
            return `jdbc:Cache://${host}:${port}`
        case 'h2': {
            const db = extra?.database?.trim()
            return db ? `jdbc:h2:tcp://${host}:${port}/${db}` : `jdbc:h2:tcp://${host}:${port}/test`
        }
        case 'hsql': {
            const db = extra?.database?.trim()
            return db ? `jdbc:hsqldb://${host}:${port}/${db}` : `jdbc:hsqldb://${host}:${port}/test`
        }
        case 'generic':
        case 'other':
            return `jdbc:${dbType}://${host}:${port}/`
        case 'dameng': {
            const db = extra?.database?.trim()
            return db ? `jdbc:dm://${host}:${port}/${db}` : `jdbc:dm://${host}:${port}`
        }
        case 'gaussdb': {
            const db = extra?.database?.trim()
            return db ? `jdbc:gaussdb://${host}:${port}/${db}` : `jdbc:gaussdb://${host}:${port}/postgres`
        }
        case 'flink':
            return `jdbc:flink://${host}:${port}`
        case 'trino':
            return `jdbc:trino://${host}:${port}`
        case 'hive':
            return buildHive2Url(dbType, host, port, extra, extra)
        case 'kudu':
            return host.includes(',') ? `kudu://${host}` : `kudu://${host}:${port}`
        default:
            return `jdbc:${dbType}://${host}:${port}/`
    }
}
