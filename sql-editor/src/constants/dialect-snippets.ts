import type {SqlSnippet} from '@sql-editor/types'
import {getActiveSqlDialectFile} from '@sql-editor/completion/keyword-config'
import {resolveSqlDialectFile} from '@sql-editor/completion/dialect-aliases'

const DIALECT_DATE_SNIPPETS: Record<string, SqlSnippet[]> = {
    mysql: [
        {
            label: 'dt7',
            insertText: '${1:created_at} >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)',
            detail: 'Last 7 days',
        },
        {
            label: 'dt30',
            insertText: '${1:created_at} >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)',
            detail: 'Last 30 days',
        },
    ],
    postgresql: [
        {
            label: 'dt7',
            insertText: "${1:created_at} >= CURRENT_DATE - INTERVAL '7 days'",
            detail: 'Last 7 days',
        },
        {
            label: 'dt30',
            insertText: "${1:created_at} >= CURRENT_DATE - INTERVAL '30 days'",
            detail: 'Last 30 days',
        },
    ],
    oracle: [
        {
            label: 'dt7',
            insertText: '${1:created_at} >= TRUNC(SYSDATE) - 7',
            detail: 'Last 7 days',
        },
        {
            label: 'dt30',
            insertText: '${1:created_at} >= TRUNC(SYSDATE) - 30',
            detail: 'Last 30 days',
        },
    ],
    sqlserver: [
        {
            label: 'dt7',
            insertText: '${1:created_at} >= DATEADD(day, -7, CAST(GETDATE() AS date))',
            detail: 'Last 7 days',
        },
        {
            label: 'dt30',
            insertText: '${1:created_at} >= DATEADD(day, -30, CAST(GETDATE() AS date))',
            detail: 'Last 30 days',
        },
    ],
    sqlite: [
        {
            label: 'dt7',
            insertText: "${1:created_at} >= date('now', '-7 days')",
            detail: 'Last 7 days',
        },
        {
            label: 'dt30',
            insertText: "${1:created_at} >= date('now', '-30 days')",
            detail: 'Last 30 days',
        },
    ],
}

const DIALECT_LIMIT_SNIPPETS: Record<string, SqlSnippet> = {
    mysql: {label: 'lim', insertText: 'LIMIT ${1:100}', detail: 'LIMIT n'},
    postgresql: {label: 'lim', insertText: 'LIMIT ${1:100}', detail: 'LIMIT n'},
    oracle: {
        label: 'lim',
        insertText: 'FETCH FIRST ${1:100} ROWS ONLY',
        detail: 'FETCH FIRST n ROWS',
    },
    sqlserver: {label: 'lim', insertText: 'TOP ${1:100}', detail: 'TOP n (after SELECT)'},
    sqlite: {label: 'lim', insertText: 'LIMIT ${1:100}', detail: 'LIMIT n'},
    flink: {label: 'lim', insertText: 'LIMIT ${1:100}', detail: 'LIMIT n'},
}

function resolveDialectKey(dialect?: string | null): string {
    const file = resolveSqlDialectFile(dialect ?? getActiveSqlDialectFile())
    if (!file) return 'mysql'
    if (file in DIALECT_DATE_SNIPPETS) return file
    if (file === 'mariadb' || file === 'hive') return 'mysql'
    if (file === 'flink') return 'flink'
    return 'mysql'
}

/** 方言相关的日期 / 分页片段 */
export function dialectSnippetsForSlot(
    slot: string,
    dialect?: string | null,
): SqlSnippet[] {
    const key = resolveDialectKey(dialect)
    if (slot === 'where') return [...(DIALECT_DATE_SNIPPETS[key] ?? DIALECT_DATE_SNIPPETS.mysql)]
    if (slot === 'tail') {
        const lim = DIALECT_LIMIT_SNIPPETS[key] ?? DIALECT_LIMIT_SNIPPETS.mysql
        return [lim]
    }
    return []
}

/** 用方言片段覆盖同 label 的通用片段 */
export function mergeDialectSnippets(base: SqlSnippet[], slot: string, dialect?: string | null): SqlSnippet[] {
    const dialectOnes = dialectSnippetsForSlot(slot, dialect)
    if (!dialectOnes.length) return base
    const overrideLabels = new Set(dialectOnes.map((s) => s.label.toLowerCase()))
    const filtered = base.filter((s) => !overrideLabels.has(s.label.toLowerCase()))
    return [...filtered, ...dialectOnes]
}
