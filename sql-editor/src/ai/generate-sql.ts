import type {SqlEditorAiSettings, SqlEditorLocale, SqlEditorSchema} from '@sql-editor/types'
import type {SqlEditorAiAction} from './actions'
import {buildSqlAiMessages} from './build-sql-prompt'
import {chatCompletion, stripPlainTextFence, stripSqlCodeFence} from './openai-compatible'
import {isSqlEditorAiReady, resolveSqlEditorAiSettings} from './settings'

function stripAiResponse(action: SqlEditorAiAction, raw: string): string {
    if (action === 'explain') return stripPlainTextFence(raw)
    return stripSqlCodeFence(raw)
}

export async function runSqlEditorAiAction(options: {
    ai: SqlEditorAiSettings | null | undefined
    action: SqlEditorAiAction
    prompt: string
    dialect?: string
    schema: SqlEditorSchema
    currentSql?: string
    selection?: string
    locale?: SqlEditorLocale
    signal?: AbortSignal
}): Promise<string> {
    if (!isSqlEditorAiReady(options.ai)) {
        throw new Error('AI is not configured')
    }

    const config = resolveSqlEditorAiSettings(options.ai)
    const messages = buildSqlAiMessages({
        action: options.action,
        prompt: options.prompt,
        dialect: options.dialect,
        schema: options.schema,
        currentSql: options.currentSql,
        selection: options.selection,
        locale: options.locale,
    })

    const raw = await chatCompletion({
        baseUrl: config.baseUrl!,
        apiKey: config.apiKey!,
        model: config.model ?? 'gpt-4o-mini',
        messages,
        signal: options.signal,
    })

    return stripAiResponse(options.action, raw)
}

/** @deprecated use runSqlEditorAiAction */
export async function generateSqlWithAi(options: {
    ai: SqlEditorAiSettings | null | undefined
    prompt: string
    dialect?: string
    schema: SqlEditorSchema
    currentSql?: string
    selection?: string
    signal?: AbortSignal
}): Promise<string> {
    return runSqlEditorAiAction({...options, action: 'generate'})
}
