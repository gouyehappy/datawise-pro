import type {TeamSummary} from '@/core/types'
import {isUnsavedConnectionId} from '@/features/connection/utils/connection-defaults'
import {canManageTeam, isTeamViewer} from '@/features/team/services/team-role.service'

export type ConnectionAccessLevel = 'readonly' | 'readwrite' | 'ddl'

const WRITE_PATTERN =
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|MERGE|UPSERT|GRANT|REVOKE|CALL|EXEC|EXECUTE|DO|LOAD\s+DATA|COPY|VACUUM|REFRESH|BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\b/i

const DDL_PATTERN = /\b(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|RENAME)\b/i

const SELECT_SIDE_EFFECT =
    /\bINTO\s+(OUTFILE|DUMPFILE)\b|\bFOR\s+UPDATE\b|\bLOCK\s+IN\s+SHARE\s+MODE\b|\bLOAD_FILE\s*\(|\bCOPY\s+[\s\S]+?\s+(TO|FROM)\b/i

const MYSQL_EXECUTABLE_COMMENT = /\/\*!\d*([\s\S]*?)\*\//g

const ACCESS_ORDER: Record<ConnectionAccessLevel, number> = {
    readonly: 0,
    readwrite: 1,
    ddl: 2,
}

export function normalizeStoredAccess(value: string | undefined): ConnectionAccessLevel {
    if (!value?.trim()) return 'ddl'
    switch (value.trim().toLowerCase()) {
        case 'read':
        case 'readonly':
            return 'readonly'
        case 'readwrite':
        case 'dml':
            return 'readwrite'
        case 'write':
        case 'ddl':
            return 'ddl'
        default:
            // Fail closed — match backend ConnectionAccessLevelSupport
            return 'readonly'
    }
}

export function requiresWriteAccess(sql: string): boolean {
    for (const statement of splitStatements(sql)) {
        if (requiresWriteAccessSingle(statement)) return true
    }
    return false
}

export function requiresDdlAccess(sql: string): boolean {
    for (const statement of splitStatements(sql)) {
        const stripped = prepareForClassification(statement)
        if (stripped && DDL_PATTERN.test(stripped)) return true
    }
    return false
}

function requiresWriteAccessSingle(sql: string): boolean {
    const stripped = prepareForClassification(sql)
    if (!stripped) return false
    if (WRITE_PATTERN.test(stripped)) return true
    if (SELECT_SIDE_EFFECT.test(stripped)) return true
    const upper = stripped.toUpperCase()
    return !upper.startsWith('SELECT')
        && !upper.startsWith('WITH')
        && !upper.startsWith('SHOW')
        && !upper.startsWith('DESCRIBE')
        && !upper.startsWith('DESC')
        && !upper.startsWith('EXPLAIN')
        && !upper.startsWith('USE ')
}

function prepareForClassification(sql: string): string {
    const expanded = sql.includes('/*!')
        ? sql.replace(MYSQL_EXECUTABLE_COMMENT, ' $1 ')
        : sql
    return stripSqlComments(expanded).trim()
}

function splitStatements(sql: string): string[] {
    const parts = sql.split(';').map((part) => part.trim()).filter(Boolean)
    return parts.length > 0 ? parts : [sql]
}

function stripSqlComments(sql: string): string {
    const noBlock = sql.replace(/\/\*[\s\S]*?\*\//g, ' ')
    return noBlock
        .split('\n')
        .map((line) => {
            const idx = line.indexOf('--')
            return idx >= 0 ? line.slice(0, idx) : line
        })
        .join('\n')
}

export function resolveConnectionAccess(
    connectionId: string | undefined,
    teams: TeamSummary[],
): ConnectionAccessLevel {
    if (!connectionId?.trim()) return 'ddl'

    let effective: ConnectionAccessLevel | null = null
    for (const team of teams) {
        const sharedIds = team.sharedConnectionIds ?? []
        if (!sharedIds.includes(connectionId)) continue

        const role = team.role
        let level: ConnectionAccessLevel
        if (isTeamViewer(role)) {
            level = 'readonly'
        } else if (canManageTeam(role)) {
            level = 'ddl'
        } else {
            level = normalizeStoredAccess(team.sharedConnectionAccess?.[connectionId])
        }
        effective = effective == null ? level : restrictAccess(effective, level)
    }

    return effective ?? 'ddl'
}

export function canDmlConnection(
    connectionId: string | undefined,
    teams: TeamSummary[],
): boolean {
    if (!connectionId?.trim() || isUnsavedConnectionId(connectionId)) return false
    return resolveConnectionAccess(connectionId, teams) !== 'readonly'
}

export function canDdlConnection(
    connectionId: string | undefined,
    teams: TeamSummary[],
): boolean {
    return resolveConnectionAccess(connectionId, teams) === 'ddl'
}

/** @deprecated use canDdlConnection */
export function canWriteConnection(
    connectionId: string | undefined,
    teams: TeamSummary[],
): boolean {
    return canDdlConnection(connectionId, teams)
}

function restrictAccess(current: ConnectionAccessLevel, next: ConnectionAccessLevel): ConnectionAccessLevel {
    return ACCESS_ORDER[current] <= ACCESS_ORDER[next] ? current : next
}

export function buildConnectionAccessMap(
    connectionIds: string[],
    current: Record<string, ConnectionAccessLevel | 'read' | 'write'> | undefined,
): Record<string, ConnectionAccessLevel> {
    const next: Record<string, ConnectionAccessLevel> = {}
    for (const id of connectionIds) {
        next[id] = normalizeStoredAccess(current?.[id])
    }
    return next
}

export function toStoredConnectionAccess(
    access: Record<string, ConnectionAccessLevel>,
): Record<string, ConnectionAccessLevel> {
    const stored: Record<string, ConnectionAccessLevel> = {}
    for (const [id, level] of Object.entries(access)) {
        if (level === 'readonly' || level === 'readwrite') {
            stored[id] = level
        }
    }
    return stored
}
