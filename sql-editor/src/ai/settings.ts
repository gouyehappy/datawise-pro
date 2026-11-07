import type {SqlEditorAiSettings} from '@sql-editor/types'

export const DEFAULT_SQL_EDITOR_AI_MODEL = 'gpt-4o-mini'

export function createDefaultSqlEditorAiSettings(): SqlEditorAiSettings {
    return {
        enabled: false,
        baseUrl: '',
        apiKey: '',
        model: DEFAULT_SQL_EDITOR_AI_MODEL,
        completionEnabled: true,
    }
}

export function normalizeSqlEditorAiLayer(
    raw: SqlEditorAiSettings | null | undefined,
): SqlEditorAiSettings | undefined {
    if (!raw || typeof raw !== 'object') return undefined

    const next: SqlEditorAiSettings = {}
    if (typeof raw.enabled === 'boolean') next.enabled = raw.enabled
    if (typeof raw.completionEnabled === 'boolean') next.completionEnabled = raw.completionEnabled
    if (typeof raw.baseUrl === 'string') next.baseUrl = raw.baseUrl.trim()
    if (typeof raw.apiKey === 'string') next.apiKey = raw.apiKey.trim()
    const model = typeof raw.model === 'string' ? raw.model.trim() : ''
    if (model) next.model = model

    return Object.keys(next).length ? next : undefined
}

export function resolveSqlEditorAiSettings(
    layer?: SqlEditorAiSettings | null,
): SqlEditorAiSettings {
    const base = createDefaultSqlEditorAiSettings()
    const patch = normalizeSqlEditorAiLayer(layer)
    if (!patch) return base
    return {
        enabled: patch.enabled ?? base.enabled,
        baseUrl: patch.baseUrl ?? base.baseUrl,
        apiKey: patch.apiKey ?? base.apiKey,
        model: patch.model ?? base.model,
        completionEnabled: patch.completionEnabled ?? base.completionEnabled,
    }
}

/** 开关打开且 baseUrl / apiKey 已填 */
export function isSqlEditorAiReady(ai: SqlEditorAiSettings | null | undefined): boolean {
    const resolved = resolveSqlEditorAiSettings(ai)
    return Boolean(resolved.enabled && resolved.baseUrl && resolved.apiKey)
}

/** AI 已配置且允许出现在补全 / HintBar 芯片 */
export function isSqlEditorAiCompletionEnabled(ai: SqlEditorAiSettings | null | undefined): boolean {
    const resolved = resolveSqlEditorAiSettings(ai)
    return isSqlEditorAiReady(ai) && resolved.completionEnabled !== false
}
