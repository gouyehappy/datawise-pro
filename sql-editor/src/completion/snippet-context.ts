import type {SqlCompletionSlot, SqlStatementKind} from '@sql-editor/types'

/** 语句已展开时，不再在 statement_start 槽位弹出 Tab 片段 */
const SNIPPET_BLOCK_AFTER_KEYWORD =
    /\b(select|insert|update|delete|create|alter|drop|truncate|rename|with|from|where|join|set|values|group|order|having|limit)\b/i

/**
 * 是否应在此上下文展示 Tab 片段（统一门控，避免 DDL/DML 中途误弹 sel/cte 等）。
 * - 空编辑器 / unknown：允许
 * - 非 statement_start 槽位：仅展示该槽位绑定的片段
 * - statement_start 且 SQL 已含子句关键字：禁止（应交表/列/关键字收集器）
 */
export function isSnippetExpansionContext(
    statement: SqlStatementKind,
    slot: SqlCompletionSlot,
    segment: string,
): boolean {
    if (slot !== 'statement_start') return true
    if (statement === 'empty' || statement === 'unknown') return true
    const trimmed = segment.trim()
    if (!trimmed) return true
    return !SNIPPET_BLOCK_AFTER_KEYWORD.test(trimmed)
}
