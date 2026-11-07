import type {SqlEditorLocale, SqlEditorSchema} from '@sql-editor/types'
import type {SqlEditorAiAction} from './actions'
import type {ChatMessage} from './openai-compatible'

const MAX_TABLES = 48
const MAX_COLUMNS_PER_TABLE = 24

export function buildSchemaSummary(schema: SqlEditorSchema): string {
    const tables = schema.tables.slice(0, MAX_TABLES)
    if (!tables.length) return '(no schema tables loaded)'

    const lines: string[] = []
    for (const table of tables) {
        const cols = (schema.columns[table] ?? []).slice(0, MAX_COLUMNS_PER_TABLE)
        const colParts = cols.map((c) => {
            const bits = [c.name]
            if (c.type) bits.push(c.type)
            if (c.pk) bits.push('PK')
            if (c.comment) bits.push(`-- ${c.comment}`)
            return bits.join(' ')
        })
        const catalog = schema.tableCatalogs?.[table]
        const prefix = catalog ? `${catalog}.` : ''
        lines.push(`${prefix}${table}(${colParts.join(', ')})`)
    }

    if (schema.foreignKeys?.length) {
        lines.push('')
        lines.push('Foreign keys:')
        for (const fk of schema.foreignKeys.slice(0, 32)) {
            lines.push(`${fk.fromTable}.${fk.fromColumn} -> ${fk.toTable}.${fk.toColumn}`)
        }
    }

    if (schema.tables.length > MAX_TABLES) {
        lines.push(`… ${schema.tables.length - MAX_TABLES} more tables omitted`)
    }

    return lines.join('\n')
}

function targetSql(action: SqlEditorAiAction, selection?: string, currentSql?: string): string | undefined {
    const selected = selection?.trim()
    if (selected) return selected
    const current = currentSql?.trim()
    if (current && (action === 'explain' || action === 'optimize' || action === 'fix')) return current
    return undefined
}

function buildSystemPrompt(options: {
    action: SqlEditorAiAction
    dialect: string
    schemaBlock: string
    explainLocale?: 'zh' | 'en'
}): string {
    const dialect = options.dialect.toUpperCase()
    const schema = ['Schema:', options.schemaBlock].join('\n')

    switch (options.action) {
        case 'explain':
            return [
                'You are a SQL tutor embedded in a database IDE.',
                `Target dialect: ${dialect}.`,
                options.explainLocale === 'zh'
                    ? 'Reply in Simplified Chinese. Use plain prose, no markdown headings or code fences.'
                    : 'Reply in English. Use plain prose, no markdown headings or code fences.',
                'Explain what the SQL does, table joins, filters, and pitfalls.',
                'Do not rewrite the SQL unless asked.',
                '',
                schema,
            ].join('\n')
        case 'optimize':
            return [
                'You are a SQL performance assistant embedded in a database IDE.',
                `Target dialect: ${dialect}.`,
                'Return only the improved SQL without markdown fences or explanation.',
                'Preserve semantics. Use schema table/column names when possible.',
                'Prefer safe read-only SELECT unless the input is clearly DML.',
                '',
                schema,
            ].join('\n')
        case 'fix':
            return [
                'You are a SQL debugger embedded in a database IDE.',
                `Target dialect: ${dialect}.`,
                'The user provides a database error message. Fix the SQL so it runs.',
                'Return only corrected SQL without markdown fences or explanation.',
                'Use schema table/column names when possible.',
                '',
                schema,
            ].join('\n')
        case 'mock':
            return [
                'You are a SQL test-data assistant embedded in a database IDE.',
                `Target dialect: ${dialect}.`,
                'Return only INSERT statements without markdown fences or explanation.',
                'Use realistic sample values. Respect column types and PK/FK from schema.',
                'Prefer 3-5 rows unless the user asks otherwise.',
                '',
                schema,
            ].join('\n')
        case 'generate':
        default:
            return [
                'You are a SQL assistant embedded in a database IDE.',
                `Target dialect: ${dialect}.`,
                'Return only executable SQL without markdown fences or explanation.',
                'Use only table and column names from the schema when possible.',
                'Prefer safe read-only SELECT unless the user asks for DML/DDL.',
                '',
                schema,
            ].join('\n')
    }
}

function buildUserPrompt(options: {
    action: SqlEditorAiAction
    prompt: string
    selection?: string
    currentSql?: string
}): string {
    const sql = targetSql(options.action, options.selection, options.currentSql)
    const parts: string[] = []

    if (options.action === 'fix') {
        parts.push(`Database error:\n${options.prompt.trim()}`)
        if (sql) parts.push('', 'SQL to fix:', sql)
        else if (options.currentSql?.trim()) parts.push('', 'Editor SQL:', options.currentSql.trim())
        return parts.join('\n')
    }

    if (options.prompt.trim()) {
        parts.push(`User request: ${options.prompt.trim()}`)
    }

    if (sql) {
        const label =
            options.action === 'explain'
                ? 'SQL to explain:'
                : options.action === 'optimize'
                    ? 'SQL to optimize:'
                    : options.selection?.trim()
                        ? 'Selected SQL to rewrite or extend:'
                        : 'Current editor SQL (for context):'
        parts.push('', label, sql)
    } else if (options.currentSql?.trim() && options.action === 'generate') {
        parts.push('', 'Current editor SQL (for context):', options.currentSql.trim())
    }

    return parts.join('\n')
}

export function buildSqlGenerationMessages(options: {
    prompt: string
    dialect?: string
    schema: SqlEditorSchema
    currentSql?: string
    selection?: string
}): ChatMessage[] {
    return buildSqlAiMessages({...options, action: 'generate'})
}

export function buildSqlAiMessages(options: {
    action: SqlEditorAiAction
    prompt: string
    dialect?: string
    schema: SqlEditorSchema
    currentSql?: string
    selection?: string
    locale?: SqlEditorLocale
}): ChatMessage[] {
    const dialect = (options.dialect ?? 'mysql').toUpperCase()
    const schemaBlock = buildSchemaSummary(options.schema)
    const explainLocale = options.locale?.startsWith('zh') ? 'zh' : 'en'

    return [
        {
            role: 'system',
            content: buildSystemPrompt({
                action: options.action,
                dialect,
                schemaBlock,
                explainLocale,
            }),
        },
        {
            role: 'user',
            content: buildUserPrompt(options),
        },
    ]
}
