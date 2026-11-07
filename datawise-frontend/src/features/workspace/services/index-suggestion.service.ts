import type {DbType} from '@/core/types'
import type {ExplainPlanNode} from '@/features/workspace/types/explain-plan'
import {buildQualifiedTableName, quoteSqlIdentifier} from '@/features/connection/services/db-type-quotes'
import {buildExplainIndexHints} from '@/features/workspace/services/explain-index-hints.service'

export interface IndexDraft {
    table: string
    indexName: string
    columns: string[]
    reason: string
}

const IDENTIFIER = /[`"']?([a-zA-Z_][\w$]*)[`"']?/g

export function extractTableNamesFromSql(sql: string): string[] {
    const tables = new Set<string>()
    for (const match of sql.matchAll(/\b(?:from|join|into|update)\s+([`"'\w.]+)/gi)) {
        const raw = match[1]?.replace(/[`"']/g, '').trim()
        if (!raw) continue
        const name = raw.includes('.') ? raw.split('.').pop()! : raw
        if (/^[a-zA-Z_][\w$]*$/.test(name)) tables.add(name)
    }
    return [...tables]
}

function extractTableAliases(sql: string): Map<string, string> {
    const aliases = new Map<string, string>()
    for (const match of sql.matchAll(
        /\b(?:from|join)\s+[`"']?([\w.]+)[`"']?(?:\s+(?:as\s+)?([`"']?[\w$]+[`"']?))?/gi,
    )) {
        const rawTable = match[1]?.replace(/[`"']/g, '').trim()
        const alias = match[2]?.replace(/[`"']/g, '').trim()
        if (!rawTable || !alias) continue
        const table = rawTable.includes('.') ? rawTable.split('.').pop()! : rawTable
        if (alias.toLowerCase() !== table.toLowerCase()) {
            aliases.set(alias.toLowerCase(), table)
        }
    }
    return aliases
}

export function extractFilterColumnsForTable(sql: string, tableName: string): string[] {
    const columns = new Set<string>()
    const tableLower = tableName.toLowerCase()
    const aliases = extractTableAliases(sql)
    const matchesTable = (token: string) => {
        const lower = token.toLowerCase()
        return lower === tableLower || aliases.get(lower) === tableName
    }

    const whereMatch = sql.match(/\bwhere\b([\s\S]*?)(?:\border\s+by\b|\bgroup\s+by\b|\blimit\b|\bunion\b|$)/i)
    if (whereMatch?.[1]) {
        const clause = whereMatch[1]
        for (const match of clause.matchAll(/([`"']?\w+[`"']?)\s*\.\s*([`"']?\w+[`"']?)\s*[=<>!]/gi)) {
            const left = match[1].replace(/[`"']/g, '')
            const col = match[2].replace(/[`"']/g, '')
            if (matchesTable(left)) columns.add(col)
        }
        for (const match of clause.matchAll(/(?<![\w.])([`"']?\w+[`"']?)\s*[=<>!]/gi)) {
            columns.add(match[1].replace(/[`"']/g, ''))
        }
    }

    const orderMatch = sql.match(/\border\s+by\b([\s\S]*?)(?:\blimit\b|\bunion\b|$)/i)
    if (orderMatch?.[1]) {
        for (const match of orderMatch[1].matchAll(IDENTIFIER)) {
            const token = match[1]
            if (!/^(asc|desc)$/i.test(token)) columns.add(token)
        }
    }

    const joinMatch = sql.matchAll(
        new RegExp(`\\bjoin\\s+[\`'"]?${tableName}[\`'"]?\\s+\\w+\\s+on\\s+([\\s\\S]*?)(?:\\bwhere\\b|\\bjoin\\b|\\border\\b|$)`, 'gi'),
    )
    for (const match of joinMatch) {
        for (const part of match[1].matchAll(/([`"']?\w+[`"']?)\s*\.\s*([`"']?\w+[`"']?)\s*=/gi)) {
            columns.add(part[2].replace(/[`"']/g, ''))
        }
    }

    return [...columns].filter((column) => column && !/^\d+$/.test(column)).slice(0, 4)
}

function scanTablesFromPlan(nodes: ExplainPlanNode[]): string[] {
    const tables = new Set<string>()
    const walk = (items: ExplainPlanNode[]) => {
        for (const node of items) {
            const label = node.label
            const tableMetric = node.metrics?.table
                ?? node.metrics?.['Relation Name']
                ?? node.metrics?.['relation name']
            if (typeof tableMetric === 'string' && tableMetric.trim()) {
                tables.add(tableMetric.trim())
            } else {
                const match = label.match(/^([^(]+)\s*\(/)
                if (match?.[1]?.trim()) tables.add(match[1].trim())
            }
            if (label.toUpperCase().includes('SEQ SCAN') && node.metrics?.['Relation Name']) {
                tables.add(String(node.metrics['Relation Name']))
            }
            if (node.children?.length) walk(node.children)
        }
    }
    walk(nodes)
    return [...tables]
}

function sanitizeIndexName(table: string, columns: string[]): string {
    const base = ['idx', table, ...columns].join('_').replace(/[^\w]+/g, '_').toLowerCase()
    return base.slice(0, 56)
}

export function buildHeuristicIndexDrafts(
    nodes: ExplainPlanNode[],
    sql: string,
    dbType?: DbType,
): IndexDraft[] {
    const hints = buildExplainIndexHints(nodes, dbType)
    const tablesFromPlan = scanTablesFromPlan(nodes)
    const tablesFromSql = extractTableNamesFromSql(sql)
    const targetTables = [...new Set([...tablesFromPlan, ...tablesFromSql])]
    const drafts: IndexDraft[] = []
    const seen = new Set<string>()

    for (const table of targetTables) {
        const columns = extractFilterColumnsForTable(sql, table)
        const hint = hints.find((item) =>
            item.table?.toLowerCase() === table.toLowerCase()
            || item.message.toLowerCase().includes(table.toLowerCase()),
        )
        if (!columns.length && !hint) continue
        const key = `${table}:${columns.join(',') || '_'}`
        if (seen.has(key)) continue
        seen.add(key)
        drafts.push({
            table,
            indexName: sanitizeIndexName(table, columns.length ? columns : ['todo']),
            columns,
            reason: hint?.suggestion
                ?? hint?.message
                ?? `Improve access path for ${table}`,
        })
    }

    if (!drafts.length && hints.length) {
        const fallbackTable = hints.find((hint) => hint.table)?.table
            ?? tablesFromSql[0]
            ?? 'target_table'
        const columns = extractFilterColumnsForTable(sql, fallbackTable)
        drafts.push({
            table: fallbackTable,
            indexName: sanitizeIndexName(fallbackTable, columns.length ? columns : ['todo']),
            columns,
            reason: hints[0]?.suggestion ?? hints[0]?.message ?? 'Index suggestion from plan',
        })
    }

    return drafts
}

/** 仅保留指定表的草稿（用于单条风险提示的一键生成） */
export function filterIndexDraftsByTable(drafts: IndexDraft[], table?: string): IndexDraft[] {
    const target = table?.trim()
    if (!target) return drafts
    const lower = target.toLowerCase()
    return drafts.filter((draft) => draft.table.toLowerCase() === lower)
}

export function formatCreateIndexStatement(draft: IndexDraft, dbType?: DbType, database?: string): string {
    const table = database?.trim()
        ? buildQualifiedTableName(dbType, database, draft.table)
        : quoteSqlIdentifier(dbType, draft.table)
    const indexName = quoteSqlIdentifier(dbType, draft.indexName)
    if (!draft.columns.length) {
        return `CREATE INDEX ${indexName} ON ${table} (/* column */);`
    }
    const columns = draft.columns.map((column) => quoteSqlIdentifier(dbType, column)).join(', ')
    return `CREATE INDEX ${indexName} ON ${table} (${columns});`
}

export function formatIndexDraftSql(
    drafts: IndexDraft[],
    dbType?: DbType,
    database?: string,
): string {
    if (!drafts.length) return '-- No index suggestions\n'
    return drafts
        .map((draft) => {
            const comment = `-- ${draft.reason}`
            const statement = formatCreateIndexStatement(draft, dbType, database)
            if (!draft.columns.length) {
                return `${comment}\n-- TODO: replace /* column */ with WHERE / JOIN / ORDER BY columns\n${statement}`
            }
            return `${comment}\n${statement}`
        })
        .join('\n\n')
        .concat('\n')
}

/** 从 EXPLAIN + SQL 直接生成可打开的 CREATE INDEX 草稿（不依赖 AI） */
export function buildExplainIndexDraftSql(
    nodes: ExplainPlanNode[],
    sql: string,
    dbType?: DbType,
    database?: string,
    tableFilter?: string,
): string {
    const allDrafts = buildHeuristicIndexDrafts(nodes, sql, dbType)
    const filtered = filterIndexDraftsByTable(allDrafts, tableFilter)
    const drafts = filtered.length
        ? filtered
        : tableFilter?.trim()
            ? [{
                table: tableFilter.trim(),
                indexName: sanitizeIndexName(tableFilter.trim(), ['todo']),
                columns: extractFilterColumnsForTable(sql, tableFilter.trim()),
                reason: `Improve access path for ${tableFilter.trim()}`,
            } satisfies IndexDraft]
            : allDrafts
    return formatIndexDraftSql(drafts, dbType, database)
}

export function mergeAiIndexDraftSql(aiResponse: string, fallback: string): string {
    const trimmed = aiResponse.trim()
    if (!trimmed) return fallback
    const statements = trimmed
        .split(/;\s*\n?/)
        .map((part) => part.trim())
        .filter((part) => /^create\s+index\b/i.test(part))
        .map((part) => (part.endsWith(';') ? part : `${part};`))
    if (!statements.length) return trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`
    return `${statements.join('\n\n')}\n`
}

export function summarizeExplainPlan(nodes: ExplainPlanNode[], dbType?: DbType): string {
    return buildExplainIndexHints(nodes, dbType)
        .map((hint) => `- ${hint.message}${hint.suggestion ? `: ${hint.suggestion}` : ''}`)
        .join('\n')
}
