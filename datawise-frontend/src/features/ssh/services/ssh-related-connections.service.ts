import type {ConnectionConfig, DbType} from '@/core/types'
import type {ConnectionsCatalog} from '@/shared/config/connections-catalog.types'

export type RelatedConnectionKind =
    | 'yarn-apps'
    | 'yarn-nodes'
    | 'kafka-topics'
    | 'kafka-consumer-groups'
    | 'sql-console'
    | 'redis-console'

export interface RelatedConnectionItem {
    connectionId: string
    label: string
    dbType: DbType
    kind: RelatedConnectionKind
    kindLabelKey: string
}

const SQL_CONSOLE_DB_TYPES = new Set<DbType>([
    'mysql',
    'mariadb',
    'postgresql',
    'oracle',
    'sqlserver',
    'dm',
    'clickhouse',
    'hive',
    'trino',
    'presto',
    'db2',
    'sqlite',
    'greenplum',
    'starrocks',
    'doris',
    'tidb',
    'oceanbase',
    'kingbase',
    'opengauss',
])

export function normalizeHostKey(value?: string | null): string {
    if (!value) return ''
    let host = value.trim().toLowerCase()
    if (!host) return ''
    if (host.startsWith('http://') || host.startsWith('https://')) {
        try {
            host = new URL(host).hostname.toLowerCase()
        } catch {
            // keep raw
        }
    }
    const slash = host.indexOf('/')
    if (slash > 0) host = host.slice(0, slash)
    const at = host.lastIndexOf('@')
    if (at >= 0 && at < host.length - 1) host = host.slice(at + 1)
    const colon = host.indexOf(':')
    if (colon > 0 && !host.includes(',')) {
        host = host.slice(0, colon)
    }
    return host
}

function hostTokens(config: ConnectionConfig): string[] {
    const tokens = new Set<string>()
    for (const raw of [config.host, config.url, config.sshHost]) {
        const key = normalizeHostKey(raw)
        if (key) tokens.add(key)
    }
    if (config.host?.includes(',')) {
        for (const part of config.host.split(',')) {
            const key = normalizeHostKey(part)
            if (key) tokens.add(key)
        }
    }
    return [...tokens]
}

export function hostsLikelyMatch(sshHost: string, config: ConnectionConfig): boolean {
    const sshKey = normalizeHostKey(sshHost)
    if (!sshKey) return false
    const targets = hostTokens(config)
    return targets.some((target) => target === sshKey || target.endsWith(`.${sshKey}`) || sshKey.endsWith(`.${target}`))
}

function relatedKindsForDbType(dbType: DbType): Array<{kind: RelatedConnectionKind; kindLabelKey: string}> {
    if (dbType === 'yarn') {
        return [
            {kind: 'yarn-apps', kindLabelKey: 'ssh.quickOps.relatedKinds.yarnApps'},
            {kind: 'yarn-nodes', kindLabelKey: 'ssh.quickOps.relatedKinds.yarnNodes'},
        ]
    }
    if (dbType === 'kafka') {
        return [
            {kind: 'kafka-topics', kindLabelKey: 'ssh.quickOps.relatedKinds.kafkaTopics'},
            {kind: 'kafka-consumer-groups', kindLabelKey: 'ssh.quickOps.relatedKinds.kafkaGroups'},
        ]
    }
    if (dbType === 'redis') {
        return [{kind: 'redis-console', kindLabelKey: 'ssh.quickOps.relatedKinds.redis'}]
    }
    if (SQL_CONSOLE_DB_TYPES.has(dbType)) {
        return [{kind: 'sql-console', kindLabelKey: 'ssh.quickOps.relatedKinds.sqlConsole'}]
    }
    return []
}

export function findRelatedConnections(
    sshHost: string,
    catalog: ConnectionsCatalog,
    options?: {sshConnectionId?: string; limit?: number},
): RelatedConnectionItem[] {
    const limit = options?.limit ?? 8
    const results: RelatedConnectionItem[] = []
    const seen = new Set<string>()

    for (const entry of catalog.connections) {
        if (entry.id === options?.sshConnectionId) continue
        if (!hostsLikelyMatch(sshHost, entry.config)) continue
        const kinds = relatedKindsForDbType(entry.config.dbType)
        for (const item of kinds) {
            const key = `${entry.id}:${item.kind}`
            if (seen.has(key)) continue
            seen.add(key)
            results.push({
                connectionId: entry.id,
                label: entry.config.name || entry.id,
                dbType: entry.config.dbType,
                kind: item.kind,
                kindLabelKey: item.kindLabelKey,
            })
            if (results.length >= limit) return results
        }
    }
    return results
}
