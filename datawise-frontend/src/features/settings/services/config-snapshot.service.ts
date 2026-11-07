import type {ConnectionConfig} from '@/core/types'

export const CONFIG_SNAPSHOT_KIND = 'datawise-config-snapshot' as const
export const CONFIG_SNAPSHOT_SCHEMA_VERSION = 1 as const

export interface ConfigSnapshotSavedSql {
    name: string
    connectionName: string
    sql: string
    folder?: string
    tags?: string[]
}

export interface ConfigSnapshot {
    kind: typeof CONFIG_SNAPSHOT_KIND
    schemaVersion: typeof CONFIG_SNAPSHOT_SCHEMA_VERSION
    exportedAt: string
    includePasswords: boolean
    connections: ConnectionConfig[]
    savedConsoles: ConfigSnapshotSavedSql[]
}

const SECRET_KEYS = [
    'password',
    'sshPassword',
    'sshPrivateKey',
    'sshPassphrase',
    'jumpPrivateKey',
    'jumpPassphrase',
] as const satisfies readonly (keyof ConnectionConfig)[]

export function redactConnectionConfig(
    config: ConnectionConfig,
    includePasswords = false,
): ConnectionConfig {
    const next: ConnectionConfig = {...config}
    if (includePasswords) return next
    for (const key of SECRET_KEYS) {
        if (key in next) {
            delete next[key]
        }
    }
    return next
}

export function buildConfigSnapshot(input: {
    connections: ConnectionConfig[]
    savedConsoles: ConfigSnapshotSavedSql[]
    includePasswords?: boolean
    now?: Date
}): ConfigSnapshot {
    const includePasswords = input.includePasswords === true
    return {
        kind: CONFIG_SNAPSHOT_KIND,
        schemaVersion: CONFIG_SNAPSHOT_SCHEMA_VERSION,
        exportedAt: (input.now ?? new Date()).toISOString(),
        includePasswords,
        connections: input.connections.map((item) => redactConnectionConfig(item, includePasswords)),
        savedConsoles: input.savedConsoles.map((item) => ({
            name: item.name,
            connectionName: item.connectionName,
            sql: item.sql,
            ...(item.folder ? {folder: item.folder} : {}),
            ...(item.tags?.length ? {tags: [...item.tags]} : {}),
        })),
    }
}

export function isConfigSnapshot(value: unknown): value is ConfigSnapshot {
    if (!value || typeof value !== 'object') return false
    const raw = value as Record<string, unknown>
    return raw.kind === CONFIG_SNAPSHOT_KIND
        && raw.schemaVersion === CONFIG_SNAPSHOT_SCHEMA_VERSION
        && Array.isArray(raw.connections)
        && Array.isArray(raw.savedConsoles)
}

/** Accepts a full snapshot, a bare ConnectionConfig[], or a single ConnectionConfig. */
export function parseConfigSnapshotPayload(text: string): {
    connections: ConnectionConfig[]
    savedConsoles: ConfigSnapshotSavedSql[]
    includePasswords: boolean
} {
    const parsed = JSON.parse(text) as unknown
    if (isConfigSnapshot(parsed)) {
        return {
            connections: parsed.connections,
            savedConsoles: parsed.savedConsoles,
            includePasswords: parsed.includePasswords,
        }
    }
    if (Array.isArray(parsed)) {
        return {
            connections: parsed as ConnectionConfig[],
            savedConsoles: [],
            includePasswords: false,
        }
    }
    if (parsed && typeof parsed === 'object' && 'id' in (parsed as object) && 'dbType' in (parsed as object)) {
        return {
            connections: [parsed as ConnectionConfig],
            savedConsoles: [],
            includePasswords: false,
        }
    }
    throw new Error('invalid config snapshot')
}

export function configSnapshotFileName(now = new Date()): string {
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    return `datawise-config-snapshot-${stamp}.json`
}

export function downloadConfigSnapshot(snapshot: ConfigSnapshot, fileName = configSnapshotFileName()): void {
    const blob = new Blob([`${JSON.stringify(snapshot, null, 2)}\n`], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
}
