import type {ConnectionConfig, DbType} from '@/core/types'
import {DEFAULT_PORTS} from '@/features/connection/constants/db-types'

export type TerminalCliTool = 'mysql' | 'psql'

export interface TerminalCliSnippet {
    tool: TerminalCliTool
    command: string
}

const MYSQL_CLI_TYPES = new Set<DbType>(['mysql', 'mariadb'])

function quoteCliArg(value: string): string {
    if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value
    return `'${value.replace(/'/g, `'\\''`)}'`
}

function resolveDatabase(config: ConnectionConfig, database?: string): string | undefined {
    const fromTab = database?.trim()
    if (fromTab) return fromTab
    const fromConfig = config.database?.trim()
    return fromConfig || undefined
}

function buildMysqlCommand(config: ConnectionConfig, database?: string): string {
    const host = config.host?.trim() || '127.0.0.1'
    const port = config.port?.trim() || DEFAULT_PORTS.mysql || '3306'
    const user = config.user?.trim() || 'root'
    const parts = ['mysql', '-h', quoteCliArg(host), '-P', port, '-u', quoteCliArg(user), '-p']
    const db = resolveDatabase(config, database)
    if (db) parts.push(quoteCliArg(db))
    return parts.join(' ')
}

function buildPsqlCommand(config: ConnectionConfig, database?: string): string {
    const host = config.host?.trim() || '127.0.0.1'
    const port = config.port?.trim() || DEFAULT_PORTS.postgresql || '5432'
    const user = config.user?.trim() || 'postgres'
    const parts = ['psql', '-h', quoteCliArg(host), '-p', port, '-U', quoteCliArg(user)]
    const db = resolveDatabase(config, database)
    if (db) parts.push('-d', quoteCliArg(db))
    return parts.join(' ')
}

export function buildTerminalCliSnippet(
    config: ConnectionConfig,
    database?: string,
): TerminalCliSnippet | null {
    if (MYSQL_CLI_TYPES.has(config.dbType)) {
        return {tool: 'mysql', command: buildMysqlCommand(config, database)}
    }
    if (config.dbType === 'postgresql') {
        return {tool: 'psql', command: buildPsqlCommand(config, database)}
    }
    return null
}

export function supportsTerminalCliSnippet(dbType: DbType | undefined): boolean {
    if (!dbType) return false
    return MYSQL_CLI_TYPES.has(dbType) || dbType === 'postgresql'
}
