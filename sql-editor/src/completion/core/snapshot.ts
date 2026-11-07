import type {SqlParser} from '@sql-editor/sql-parser'
import type {SqlCompletionContext} from '../context'
import type {GrammarResolution} from '../grammar/definitions'
import type {CompletionStage} from '../grammar/types'
import type {SqlCompletionPlan} from '../grammar/types'
import {
    getCachedSnapshot,
    schemaFingerprint,
    setCachedSnapshot,
} from '../analysis-cache'
import {resolveSnapshotPlan} from '../parser/resolve-snapshot'

/** 光标输入态（与 Monaco 解耦） */
export interface CursorInput {
    prefix: string
    allowEmptyPrefix: boolean
}

/** 补全快照 — 一次分析，全程只读 */
export interface CompletionSnapshot {
    context: SqlCompletionContext
    grammar: GrammarResolution
    stage: CompletionStage
    plan: SqlCompletionPlan
    cursor: CursorInput
}

export function buildSnapshot(
    sql: string,
    offset: number,
    context: SqlCompletionContext,
    options?: { parserKeywords?: string[]; parser?: SqlParser | null },
): CompletionSnapshot {
    const resolved = resolveSnapshotPlan(context, sql, offset, options)
    return {
        context,
        grammar: resolved.grammar,
        stage: resolved.stage,
        plan: resolved.plan,
        cursor: {prefix: '', allowEmptyPrefix: true},
    }
}

/** Worker / HintBar 交付后写入 snapshot 缓存 */
export function warmCompletionSnapshot(
    sql: string,
    offset: number,
    schemaKey: string,
    context: SqlCompletionContext,
    parserKeywords?: string[] | null,
): CompletionSnapshot {
    const hit = getCachedSnapshot(sql, offset, schemaKey)
    if (hit) return hit
    const snapshot = buildSnapshot(
        sql,
        offset,
        context,
        parserKeywords != null ? {parserKeywords} : undefined,
    )
    setCachedSnapshot(sql, offset, schemaKey, snapshot)
    return snapshot
}

/** 同步路径：仅缓存命中（Provider 应用 getCompletionSnapshot） */
export function analyzeCompletion(
    sql: string,
    offset: number,
    knownTables: string[] = [],
    knownColumns: Record<string, { name: string }[]> = {},
    analyzeContext: (
        sql: string,
        offset: number,
        tables: string[],
        columns: Record<string, { name: string }[]>,
    ) => SqlCompletionContext,
): CompletionSnapshot {
    const schemaKey = schemaFingerprint(knownTables, knownColumns)
    const cached = getCachedSnapshot(sql, offset, schemaKey)
    if (cached) return cached

    const context = analyzeContext(sql, offset, knownTables, knownColumns)
    return warmCompletionSnapshot(sql, offset, schemaKey, context)
}
