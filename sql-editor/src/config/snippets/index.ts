export {
    buildDefaultSnippetConfigsFromConstants,
    getPluginBundledSharedLayer,
} from '@sql-editor/config/snippets/builtin'

export {
    normalizeSnippetConfig,
    normalizeQuickChipConfig,
    normalizeKeybindingConfig,
    normalizeSqlEditorShortcutsLayer,
    normalizeSqlEditorShortcutsSettings,
} from '@sql-editor/config/snippets/normalize'

export {
    applySqlEditorShortcutsOverlay,
    createEmptySqlEditorShortcutsLayer,
    createDefaultSqlEditorShortcutsSettings,
    mergeSqlEditorShortcutsLayers,
    resolveSqlEditorShortcutsLayers,
    toExportableSqlEditorShortcutsSettings,
    resolveSqlSnippetSource,
    snippetIdentityKey,
    filterRedundantGlobalSnippetsForDisplay,
} from '@sql-editor/config/snippets/merge'

export {sqlEditorShortcutsLayerHasOverrides} from '@sql-editor/config/snippets/layer-overrides'

export {resolvePersonalLayerForSnippetGate} from '@sql-editor/config/snippets/personal-gate'

export {
    setSqlEditorSnippetLayers,
    getSqlEditorShortcutsSettings,
    getSqlEditorAutoTableAliasEnabled,
    getSqlEditorShowHintBar,
    getSqlEditorShowHintQuickChips,
    getSqlEditorShowSuggestDetails,
    getSqlEditorShowColumnCommentInSuggest,
    getSqlEditorFolding,
    getSqlEditorShowRunGutterButton,
    sqlEditorSettingsVersion,
    getConfiguredGlobalSnippets,
    getConfiguredSlotSnippets,
} from '@sql-editor/config/snippets/cache'

export {getPluginBundledSharedLayer as getPluginBundledSqlEditorShortcuts} from '@sql-editor/config/snippets/builtin'
