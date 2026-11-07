import type {AiWorkContext, BuildAiWorkContextInput} from '@/features/ai/work-context/ai-work-context.types'
import type {WorkbenchContextSnapshot} from '@/features/ai/context/types/workbench-context.types'
import type {DbType} from '@/core/types'

export function buildAiWorkContext(input: BuildAiWorkContextInput): AiWorkContext {
    return {
        connectionId: input.connectionId?.trim() || undefined,
        database: input.database?.trim() || undefined,
        dbType: input.dbType,
        connectionLabel: input.connectionLabel?.trim() || undefined,
        sql: input.sql?.trim() || undefined,
        selection: input.selection?.trim() || undefined,
        lastError: input.lastError?.trim() || undefined,
        errorLine: input.errorLine,
    }
}

/** Fill missing console AI fields from the live workbench focus snapshot. */
export function mergeWorkbenchFocusIntoWorkContext(
    context: AiWorkContext,
    snapshot: WorkbenchContextSnapshot | null | undefined,
): AiWorkContext {
    if (!snapshot?.online) return context
    const focus = snapshot.focus
    const preview = snapshot.activeTab?.bodyPreview
    return {
        ...context,
        connectionId: context.connectionId || focus.connectionId,
        database: context.database || focus.database,
        dbType: context.dbType || (focus.dialect as DbType | undefined),
        connectionLabel: context.connectionLabel || focus.connectionName,
        sql: context.sql || preview || undefined,
    }
}

/** Compact text for AI system / user prompts when "use workbench focus" is on. */
export function formatWorkbenchFocusHint(snapshot: WorkbenchContextSnapshot): string {
    if (!snapshot.online) {
        return 'Workbench focus: offline (open DataWise UI to publish live context).'
    }
    const f = snapshot.focus
    const tab = snapshot.activeTab
    const parts = [
        `Surface: ${f.surface}`,
        f.connectionName || f.connectionId
            ? `Connection: ${f.connectionName ?? f.connectionId}${f.environment ? ` [${f.environment}]` : ''}`
            : null,
        f.dialect ? `Dialect / type: ${f.dialect}` : null,
        f.database ? `Database: ${f.database}` : null,
        f.resourcePath ? `File: ${f.resourcePath}` : null,
        f.objectName && !f.resourcePath
            ? `Object: ${f.objectKind ?? 'object'} ${f.objectName}`
            : null,
        f.pluginId ? `Plugin: ${f.pluginId}` : null,
        tab ? `Active tab: ${tab.type} — ${tab.title}` : null,
        tab?.bodyPreview
            ? `Content preview (${tab.bodyTruncated ? `truncated, ${tab.bodyLength ?? '?'} chars` : 'full'}):\n\`\`\`\n${tab.bodyPreview}\n\`\`\``
            : null,
    ].filter(Boolean)
    const fileEditHint =
        f.resourcePath || f.objectKind === 'file'
            ? '\n\nWhen the user asks to edit, reformat, or rewrite this document, use the content preview above as the source of truth and reply with the complete revised document in ONE single markdown code fence (do not split into multiple fences — the UI applies the whole reply as one file replace).'
            : ''
    return `Workbench focus:\n- ${parts.join('\n- ')}${fileEditHint}`
}

/** 将工作上下文格式化为 SQL 生成 API 的 prompt（修复 / 解释等场景复用） */
export function formatAiWorkContextPrompt(
    context: AiWorkContext,
    intent: 'fix' | 'explain' | 'optimize',
): string {
    const targetSql = context.selection || context.sql
    if (!targetSql) {
        return intent === 'fix'
            ? 'Fix the SQL error.'
            : intent === 'optimize'
                ? 'Optimize the SQL.'
                : 'Explain the SQL.'
    }

    const header = intent === 'fix'
        ? 'Fix the following SQL so it runs without error.'
        : intent === 'optimize'
            ? 'Optimize the following SQL for performance.'
            : 'Explain the following SQL.'

    const parts = [header, '', '```sql', targetSql, '```']

    if (context.lastError) {
        parts.push('', 'Database error:', context.lastError)
    }

    parts.push(
        '',
        'Reply with corrected SQL only (no markdown fences). Preserve the original intent.',
    )

    return parts.join('\n')
}

export function formatAiFixPrompt(context: AiWorkContext): string {
    return formatAiWorkContextPrompt(context, 'fix')
}

export function formatAiIndexSuggestPrompt(options: {
    sql: string
    planSummary?: string
    heuristicSql?: string
    dbType?: string
    database?: string
}): string {
    const parts = [
        'Suggest CREATE INDEX statements (draft DDL only) to improve the query below.',
        'Reply with SQL only: one CREATE INDEX per statement, include trailing semicolons.',
        'Do not execute or modify data. Prefer covering WHERE, JOIN, and ORDER BY columns.',
        '',
        '```sql',
        options.sql.trim(),
        '```',
    ]
    if (options.dbType || options.database) {
        parts.push('', `Database: ${options.database ?? '—'} (${options.dbType ?? 'unknown'})`)
    }
    if (options.planSummary?.trim()) {
        parts.push('', 'Execution plan hints:', options.planSummary.trim())
    }
    if (options.heuristicSql?.trim()) {
        parts.push('', 'Heuristic drafts (refine or replace):', options.heuristicSql.trim())
    }
    return parts.join('\n')
}
