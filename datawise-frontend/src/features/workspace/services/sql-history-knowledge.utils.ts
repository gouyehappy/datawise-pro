import type {SqlLogEntry} from '@/core/types'
import type {AiKnowledgeEntry} from '@/features/ai/knowledge/types/ai-knowledge.types'
import {normalizeKnowledgeEntry} from '@/features/ai/knowledge/types/ai-knowledge.types'
import {buildShareTeamQueryPayload} from '@/features/team/services/team-shared-query.service'
import type {ShareTeamSharedQueryPayload} from '@/core/types'

export interface SqlLogArchiveContext {
    connectionId?: string
    connectionName?: string
    database?: string
}

const TABLE_REF_PATTERN = /\b(?:from|join|into|update|table)\s+[`"']?([\w.]+)[`"']?/gi

export function extractTableNamesFromSql(sql: string): string[] {
    const tables = new Set<string>()
    for (const match of sql.matchAll(TABLE_REF_PATTERN)) {
        const raw = match[1]?.trim()
        if (!raw) continue
        const name = raw.includes('.') ? raw.split('.').pop()! : raw
        if (/^[a-zA-Z_][\w$]*$/.test(name)) {
            tables.add(name)
        }
    }
    return [...tables]
}

export function buildKnowledgeTerm(sql: string, tables: string[]): string {
    if (tables.length) {
        const label = tables.slice(0, 3).join(', ')
        return tables.length > 3 ? `SQL · ${label}…` : `SQL · ${label}`
    }
    const line = sql.trim().split('\n').find((row) => row.trim())?.replace(/\s+/g, ' ') ?? 'SQL query'
    return line.length > 56 ? `${line.slice(0, 53)}…` : line
}

export function buildKnowledgeDefinition(log: SqlLogEntry): string {
    const lines = [log.sql.trim()]
    const meta: string[] = []
    if (log.durationMs != null) meta.push(`duration=${log.durationMs}ms`)
    if (log.rows != null) meta.push(`rows=${log.rows}`)
    if (log.status) meta.push(`status=${log.status}`)
    if (meta.length) {
        lines.push('', `-- ${meta.join(', ')}`)
    }
    return lines.join('\n')
}

export function buildKnowledgeEntryFromSqlLog(
    log: SqlLogEntry,
    context: SqlLogArchiveContext,
): AiKnowledgeEntry | null {
    const sql = log.sql?.trim()
    if (!sql) return null
    const relatedTables = extractTableNamesFromSql(sql)
    const entry = normalizeKnowledgeEntry({
        id: `kb-sql-${log.id}`,
        term: buildKnowledgeTerm(sql, relatedTables),
        definition: buildKnowledgeDefinition(log),
        connectionId: log.connectionId ?? context.connectionId,
        database: log.database ?? context.database,
        relatedTables,
        synonyms: ['sql', 'query', ...relatedTables],
    })
    return entry
}

export function buildTeamQueryPayloadFromSqlLog(
    log: SqlLogEntry,
    context: SqlLogArchiveContext,
    title?: string,
): ShareTeamSharedQueryPayload {
    const sql = log.sql.trim()
    const relatedTables = extractTableNamesFromSql(sql)
    const tags = ['sql-history', ...relatedTables]
    return buildShareTeamQueryPayload({
        title: title?.trim() || buildKnowledgeTerm(sql, relatedTables),
        description: log.status === 'error' ? 'Imported from SQL history (error run)' : 'Imported from SQL history',
        connectionId: log.connectionId ?? context.connectionId,
        connectionName: context.connectionName,
        database: log.database ?? context.database,
        sql,
        tags,
    })
}
