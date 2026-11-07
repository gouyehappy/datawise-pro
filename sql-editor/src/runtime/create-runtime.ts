import {setSqlCompletionDialect} from '@sql-editor/completion/keyword-config'
import {getPluginBundledSharedLayer} from '@sql-editor/config/snippets/builtin'
import {setSqlEditorSnippetLayers} from '@sql-editor/config/snippets/cache'
import {resolvePersonalLayerForSnippetGate} from '@sql-editor/config/snippets/personal-gate'
import {resolveSqlEditorShortcutsLayers} from '@sql-editor/config/snippets/merge'
import {normalizeSqlEditorLocale} from '@sql-editor/i18n'
import type {
    SqlEditorRuntime,
    SqlEditorRuntimeOptions,
    SqlEditorSchema,
    SqlEditorSnippetLayers,
    SqlEditorShortcutsSettings,
    SqlEditorLocale,
    SqlEditorAiAssistPayload,
    SqlRecentQuery,
    SqlRecentQueryScope,
} from '@sql-editor/types'

import {toPlainSqlEditorSchema} from '@sql-editor/utils/schema-plain'
import {createEmptySqlEditorShortcutsLayer} from '@sql-editor/config/snippets/merge'

function emptySchema(): SqlEditorSchema {
    return {tables: [], columns: {}}
}

function resolvePluginSharedLayer(enabled: boolean) {
    return enabled ? getPluginBundledSharedLayer() : createEmptySqlEditorShortcutsLayer()
}

/** 创建独立运行时实例（Schema / 方言 / 片段层） */
export function createSqlEditorRuntime(options: SqlEditorRuntimeOptions = {}): SqlEditorRuntime {
    let schema: SqlEditorSchema = options.schema
        ? toPlainSqlEditorSchema(options.schema)
        : emptySchema()
    let dialect = options.dialect
    let layers: SqlEditorSnippetLayers = {
        external: options.snippetLayers?.external ?? null,
        personal: options.snippetLayers?.personal ?? null,
    }
    let disposed = false
    let pluginBundledSnippetsEnabled = true
    let teamSnippetsEnabled = true
    let personalSnippetsEnabled = true
    let cachedEffective: SqlEditorShortcutsSettings | null = null

    function invalidateEffectiveSettings() {
        cachedEffective = null
    }

    function personalForMerge() {
        return resolvePersonalLayerForSnippetGate(layers.personal, personalSnippetsEnabled)
    }

    function effectiveSettings(): SqlEditorShortcutsSettings {
        if (cachedEffective) return cachedEffective
        cachedEffective = resolveSqlEditorShortcutsLayers({
            pluginShared: resolvePluginSharedLayer(pluginBundledSnippetsEnabled),
            shared: teamSnippetsEnabled ? layers.external : null,
            personal: personalForMerge(),
        })
        return cachedEffective
    }

    let locale: SqlEditorLocale = normalizeSqlEditorLocale(effectiveSettings().locale)
    let selectedText = ''
    let recentQueries: SqlRecentQuery[] = []
    let recentQueryScope: SqlRecentQueryScope = {}
    let aiAssistHandler: ((payload: SqlEditorAiAssistPayload) => void) | null = null

    function syncLayers() {
        setSqlEditorSnippetLayers({
            pluginShared: resolvePluginSharedLayer(pluginBundledSnippetsEnabled),
            shared: teamSnippetsEnabled ? layers.external : null,
            personal: personalForMerge(),
        })
    }

    function sync(options?: { publishLayers?: boolean }) {
        if (disposed) return
        setSqlCompletionDialect(dialect)
        if (options?.publishLayers !== false) {
            syncLayers()
        }
        locale = normalizeSqlEditorLocale(effectiveSettings().locale)
    }

    if (options.sync !== false) sync()

    return {
        getSchema: () => schema,
        setSchema(next) {
            schema = next ? toPlainSqlEditorSchema(next) : emptySchema()
        },
        getDialect: () => dialect,
        setDialect(next) {
            if (dialect === next) return
            dialect = next
            invalidateEffectiveSettings()
        },
        getLocale: () => locale,
        setLocale(next) {
            locale = normalizeSqlEditorLocale(next)
        },
        getSnippetLayers: () => ({...layers}),
        setSnippetLayers(next) {
            layers = {
                external: next.external ?? null,
                personal: next.personal ?? null,
            }
            invalidateEffectiveSettings()
        },
        getPluginSnippetLayer: () => resolvePluginSharedLayer(pluginBundledSnippetsEnabled),
        setPluginBundledSnippetsEnabled(enabled) {
            if (pluginBundledSnippetsEnabled === enabled) return
            pluginBundledSnippetsEnabled = enabled
            invalidateEffectiveSettings()
        },
        isPluginBundledSnippetsEnabled: () => pluginBundledSnippetsEnabled,
        setTeamSnippetsEnabled(enabled) {
            if (teamSnippetsEnabled === enabled) return
            teamSnippetsEnabled = enabled
            invalidateEffectiveSettings()
        },
        isTeamSnippetsEnabled: () => teamSnippetsEnabled,
        setPersonalSnippetsEnabled(enabled) {
            if (personalSnippetsEnabled === enabled) return
            personalSnippetsEnabled = enabled
            invalidateEffectiveSettings()
        },
        isPersonalSnippetsEnabled: () => personalSnippetsEnabled,
        getEffectiveSettings: effectiveSettings,
        isAutoTableAliasEnabled: () => effectiveSettings().autoTableAlias,
        getSelectedText: () => selectedText,
        setSelectedText(next) {
            selectedText = next?.trim() ?? ''
        },
        getRecentQueries: () => recentQueries,
        setRecentQueries(items) {
            recentQueries = Array.isArray(items) ? items.slice(0, 40) : []
        },
        getRecentQueryScope: () => ({...recentQueryScope}),
        setRecentQueryScope(scope) {
            recentQueryScope = {
                connectionId: scope.connectionId,
                database: scope.database,
            }
        },
        setAiAssistHandler(handler) {
            aiAssistHandler = handler
        },
        invokeAiAssist(payload) {
            aiAssistHandler?.(payload)
        },
        sync,
        dispose() {
            disposed = true
        },
    }
}
