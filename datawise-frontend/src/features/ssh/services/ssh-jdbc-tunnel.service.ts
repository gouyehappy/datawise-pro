import type {ConnectionConfig} from '@/core/types'
import {formatSshEndpoint} from '@/features/terminal/services/ssh-terminal-session.service'

/** Non-JDBC explorer connection types — no JDBC SSH tunnel menu. */
const JDBC_TUNNEL_EXCLUDED_DB_TYPES = new Set(['ssh', 'redis', 'kafka', 'yarn'])

export function supportsJdbcTunnelSshMenu(dbType?: string): boolean {
    return Boolean(dbType && !JDBC_TUNNEL_EXCLUDED_DB_TYPES.has(dbType))
}

export function isJdbcSshTunnelEnabled(config?: ConnectionConfig | null): boolean {
    if (!config?.sshEnabled) return false
    return Boolean(config.sshHost?.trim() && config.sshUser?.trim())
}

export function resolveJdbcTunnelSshEndpoint(config: ConnectionConfig): string {
    return formatSshEndpoint(config.sshUser, config.sshHost, config.sshPort || '22')
}

export function resolveSshTerminalEndpoint(config: ConnectionConfig): string {
    if (config.dbType === 'ssh') {
        return formatSshEndpoint(config.user, config.host, config.port)
    }
    if (isJdbcSshTunnelEnabled(config)) {
        return resolveJdbcTunnelSshEndpoint(config)
    }
    return ''
}

export function isSshTerminalConnection(config?: ConnectionConfig | null): boolean {
    if (!config) return false
    if (config.dbType === 'ssh') return true
    return isJdbcSshTunnelEnabled(config)
}
