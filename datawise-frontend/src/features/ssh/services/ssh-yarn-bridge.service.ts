import type {ConnectionConfig} from '@/core/types'
import type {ConnectionsCatalog} from '@/shared/config/connections-catalog.types'
import {normalizeHostKey} from '@/features/ssh/services/ssh-related-connections.service'

export const YARN_APP_ID_PATTERN = /application_\d+_\d+/g

export function extractYarnAppIds(text: string): string[] {
    const matches = text.match(YARN_APP_ID_PATTERN) ?? []
    return [...new Set(matches)]
}

export function extractFirstYarnAppId(text: string): string | null {
    return extractYarnAppIds(text)[0] ?? null
}

export function buildYarnLogsCommand(appId: string, tailLines = 200): string {
    const trimmed = appId.trim()
    if (!trimmed) return ''
    return `yarn logs -applicationId ${trimmed} 2>/dev/null | tail -n ${tailLines}`
}

export function buildYarnKillCommand(appId: string): string {
    const trimmed = appId.trim()
    if (!trimmed) return ''
    return `yarn application -kill ${trimmed}`
}

function sshHostKey(config: ConnectionConfig): string {
    return normalizeHostKey(config.host)
}

export function findSshConnectionForHost(
    host: string,
    catalog: ConnectionsCatalog,
): {connectionId: string; label: string} | null {
    const target = normalizeHostKey(host)
    if (!target) return null

    for (const entry of catalog.connections) {
        if (entry.config.dbType !== 'ssh') continue
        const key = sshHostKey(entry.config)
        if (!key) continue
        if (key === target || key.endsWith(`.${target}`) || target.endsWith(`.${key}`)) {
            return {
                connectionId: entry.id,
                label: entry.config.name || entry.id,
            }
        }
    }
    return null
}

export function findYarnConnectionForHost(
    host: string,
    catalog: ConnectionsCatalog,
): {connectionId: string; label: string} | null {
    const target = normalizeHostKey(host)
    if (!target) return null

    for (const entry of catalog.connections) {
        if (entry.config.dbType !== 'yarn') continue
        const key = normalizeHostKey(entry.config.host ?? entry.config.url)
        if (!key) continue
        if (key === target || key.endsWith(`.${target}`) || target.endsWith(`.${key}`)) {
            return {
                connectionId: entry.id,
                label: entry.config.name || entry.id,
            }
        }
    }
    return null
}
