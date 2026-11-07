import {computed, ref, shallowRef, toRef, type MaybeRef} from 'vue'
import {listBuiltinQuickChipConfigs} from '@sql-editor/constants/slot-quick-actions'
import {normalizeSqlEditorShortcutsLayer, resolveSqlSnippetSource} from '@sql-editor/config/snippets'
import {createEmptySqlEditorShortcutsLayer} from '@sql-editor/config/snippets/merge'
import {keybindingEntryKey} from '@sql-editor/editor/shortcut-config'
import {resolveSqlDialectFile} from '@sql-editor/completion/dialect-aliases'
import {
    clearPersonalSqlEditorLayer,
    hasStoredPersonalConfig,
    isPersonalLayerEmpty,
} from '@sql-editor/settings/personal-storage'
import {
    patchPersonalSqlEditorLayer,
    removePersonalLayerSnippet,
    setPersonalKeybindingEnabled,
    setPersonalQuickChipEnabled,
    updatePersonalKeybindingKeys,
    upsertPersonalLayerSnippet,
} from '@sql-editor/settings/personal-layer-mutations'
import {
    createPersonalSqlEditorPersistence,
    persistenceHasShared,
    type SqlEditorShortcutsPersistence,
} from '@sql-editor/settings/persistence'
import type {
    SqlCompletionSlot,
    SqlEditorRuntime,
    SqlEditorShortcutsLayer,
    SqlEditorShortcutsSettings,
    SqlKeybindingConfig,
    SqlSnippetConfig,
} from '@sql-editor/types'

function sharedLayerHasContent(layer: SqlEditorShortcutsLayer): boolean {
    return (layer.snippets?.length ?? 0) > 0 || typeof layer.autoTableAlias === 'boolean'
}

export type SqlEditorShortcutsControllerOptions = {
    dialect?: MaybeRef<string | null | undefined>
    persistence?: SqlEditorShortcutsPersistence
    parseSharedConfigText?: (text: string) => SqlEditorShortcutsLayer | null
    exportSharedConfig?: (layer: SqlEditorShortcutsLayer) => void
}

export type SqlSnippetSource = ReturnType<typeof resolveSqlSnippetSource>

/**
 * SQL 编辑器快捷键 / 片段 / 行为设置的统一控制器。
 * 抽屉与 App 设置页共用；可选 shared 持久化由宿主注入。
 */
export function useSqlEditorShortcutsController(
    runtime: SqlEditorRuntime,
    options: SqlEditorShortcutsControllerOptions = {},
) {
    const persistence = options.persistence ?? createPersonalSqlEditorPersistence()
    const hasSharedPersistence = persistenceHasShared(persistence)

    const personalLayer = ref(persistence.readPersonal())
    const sharedLayer = hasSharedPersistence ? ref(persistence.readShared()) : undefined
    const revision = shallowRef(0)

    const dialectRef =
        options.dialect !== undefined ? toRef(options.dialect) : ref<string | null | undefined>(null)
    const dialectFile = computed(() => resolveSqlDialectFile(dialectRef.value) ?? 'common')

    function syncRuntime() {
        const current = runtime.getSnippetLayers()
        const personal = isPersonalLayerEmpty(personalLayer.value) ? null : personalLayer.value
        const external = hasSharedPersistence
            ? sharedLayer!.value
            : current.external

        runtime.setSnippetLayers({
            ...current,
            external,
            personal,
        })
        runtime.sync()
        revision.value += 1
    }

    function persist() {
        persistence.writePersonal(personalLayer.value)
        if (hasSharedPersistence) {
            persistence.writeShared!(sharedLayer!.value)
        }
        syncRuntime()
    }

    syncRuntime()

    const settings = computed(() => {
        void revision.value
        return runtime.getEffectiveSettings()
    })

    const pluginSettings = computed(() => {
        void revision.value
        return runtime.getPluginSnippetLayer()
    })

    const hasCustomConfig = computed(() => {
        void revision.value
        return hasStoredPersonalConfig() || !isPersonalLayerEmpty(personalLayer.value)
    })

    const pluginSnippetCount = computed(() => pluginSettings.value.snippets?.length ?? 0)
    const sharedSnippetCount = computed(() => sharedLayer?.value.snippets?.length ?? 0)
    const personalSnippetCount = computed(() => personalLayer.value.snippets?.length ?? 0)
    const hasSharedLayer = computed(() =>
        hasSharedPersistence ? sharedLayerHasContent(sharedLayer!.value) : false,
    )

    function snippetSource(id: string): SqlSnippetSource {
        return resolveSqlSnippetSource(id, {
            pluginShared: pluginSettings.value,
            shared: sharedLayer?.value ?? createEmptySqlEditorShortcutsLayer(),
            personal: personalLayer.value,
        })
    }

    function isSnippetEditable(id: string): boolean {
        const source = snippetSource(id)
        return source === 'personal' || source === 'builtin'
    }

    function patchSettings(patch: Partial<SqlEditorShortcutsSettings>) {
        // personal → persist → syncRuntime → setSqlEditorSnippetLayers（唯一 cache 写入）
        personalLayer.value = patchPersonalSqlEditorLayer(personalLayer.value, patch)
        persist()
    }

    function setQuickChipEnabled(chipId: string, enabled: boolean) {
        personalLayer.value = setPersonalQuickChipEnabled(personalLayer.value, chipId, enabled)
        persist()
    }

    function isQuickChipEnabled(chipId: string): boolean {
        return !(settings.value.disabledQuickChipIds ?? []).includes(chipId)
    }

    function setKeybindingEnabled(binding: SqlKeybindingConfig, enabled: boolean) {
        personalLayer.value = setPersonalKeybindingEnabled(personalLayer.value, binding, enabled)
        persist()
    }

    function isKeybindingEnabled(binding: SqlKeybindingConfig): boolean {
        return !(settings.value.disabledKeybindingKeys ?? []).includes(keybindingEntryKey(binding))
    }

    function updateKeybindingKeys(binding: SqlKeybindingConfig, keys: string): boolean {
        const result = updatePersonalKeybindingKeys(personalLayer.value, binding, keys)
        if (!result.ok) return false
        personalLayer.value = result.layer
        persist()
        return true
    }

    function toggleSnippet(id: string, enabled: boolean) {
        upsertPersonalSnippet(id, {enabled})
    }

    function upsertPersonalSnippet(id: string, patch: Partial<SqlSnippetConfig>) {
        const base = settings.value.snippets.find((item) => item.id === id)
        personalLayer.value = upsertPersonalLayerSnippet(personalLayer.value, id, patch, base)
        persist()
    }

    function addCustomSnippet(input: {
        label: string
        insertText: string
        detail?: string
        slots: SqlCompletionSlot[]
    }) {
        const label = input.label.trim()
        const insertText = input.insertText.trim()
        if (!label || !insertText || !input.slots.length) return null
        const id = `custom-${Date.now()}`
        upsertPersonalSnippet(id, {
            label,
            insertText,
            detail: input.detail?.trim() ?? '',
            enabled: true,
            slots: [...input.slots],
        })
        return id
    }

    function removePersonalSnippet(id: string) {
        const next = removePersonalLayerSnippet(personalLayer.value, id)
        if (!next) return
        personalLayer.value = next
        persist()
    }

    function hasSnippetOverride(id: string): boolean {
        return personalLayer.value.snippets?.some((item) => item.id === id) ?? false
    }

    function isCustomSnippetId(id: string): boolean {
        return id.startsWith('custom-') || id.startsWith('custom.')
    }

    function resetPersonal() {
        personalLayer.value = createEmptySqlEditorShortcutsLayer()
        clearPersonalSqlEditorLayer()
        persist()
    }

    function applyShared(layer?: SqlEditorShortcutsLayer | null) {
        if (!hasSharedPersistence) return
        sharedLayer!.value = normalizeSqlEditorShortcutsLayer(layer)
        persist()
    }

    function applyPersonal(layer?: SqlEditorShortcutsLayer | null) {
        personalLayer.value = normalizeSqlEditorShortcutsLayer(layer)
        persist()
    }

    function importSharedConfigText(text: string): boolean {
        if (!options.parseSharedConfigText || !hasSharedPersistence) return false
        const layer = options.parseSharedConfigText(text)
        if (!layer) return false
        applyShared(layer)
        return true
    }

    function clearShared() {
        applyShared(createEmptySqlEditorShortcutsLayer())
    }

    function exportSharedConfigFile() {
        if (!options.exportSharedConfig || !hasSharedPersistence) return
        options.exportSharedConfig(sharedLayer!.value)
    }

    function sharedSnapshot(): SqlEditorShortcutsLayer {
        return JSON.parse(JSON.stringify(sharedLayer?.value ?? createEmptySqlEditorShortcutsLayer()))
    }

    function personalSnapshot(): SqlEditorShortcutsLayer {
        return JSON.parse(JSON.stringify(personalLayer.value))
    }

    function snapshot(): SqlEditorShortcutsSettings {
        return JSON.parse(JSON.stringify(settings.value))
    }

    function refreshFromRuntime() {
        syncRuntime()
    }

    /** 从持久化重载个人/共享层（编辑器抽屉与 App 设置页对齐时用） */
    function reloadFromPersistence() {
        personalLayer.value = persistence.readPersonal()
        if (hasSharedPersistence) {
            sharedLayer!.value = persistence.readShared()
        }
        syncRuntime()
    }

    const builtinChips = computed(() => listBuiltinQuickChipConfigs())

    return {
        personalLayer,
        sharedLayer,
        settings,
        pluginSettings,
        hasCustomConfig,
        pluginSnippetCount,
        sharedSnippetCount,
        personalSnippetCount,
        hasSharedLayer,
        patchSettings,
        setQuickChipEnabled,
        isQuickChipEnabled,
        setKeybindingEnabled,
        isKeybindingEnabled,
        updateKeybindingKeys,
        toggleSnippet,
        upsertPersonalSnippet,
        addCustomSnippet,
        removePersonalSnippet,
        hasSnippetOverride,
        isCustomSnippetId,
        snippetSource,
        isSnippetEditable,
        resetPersonal,
        applyShared,
        applyPersonal,
        importSharedConfigText,
        clearShared,
        exportSharedConfig: exportSharedConfigFile,
        sharedSnapshot,
        personalSnapshot,
        snapshot,
        refreshFromRuntime,
        reloadFromPersistence,
        builtinChips,
        dialectFile,
    }
}

export type SqlEditorShortcutsController = ReturnType<typeof useSqlEditorShortcutsController>
