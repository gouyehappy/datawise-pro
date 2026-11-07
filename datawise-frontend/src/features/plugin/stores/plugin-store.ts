import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import type {NavModule, PluginItem, SettingsSection, ShortcutPanel} from '@/core/types'
import {pluginsApi} from '@/api'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {i18n} from '@/i18n'
import {
    mergePluginCatalog,
    normalizePluginId,
    PLUGIN_CENTER_SETTINGS_TAB,
    PLUGIN_REGISTRY,
    listPluginRequires,
    resolvePluginEnabled,
    resolvePluginSettingsTab,
    resolveSqlSnippetLayerEnabled,
    SHORTCUT_PANEL_PLUGIN_MAP,
    shortcutPanelForPlugin,
    type PluginId,
    type SqlSnippetLayerId,
} from '@/features/plugin/services/plugin-registry.service'
import {
    isSqlSnippetPluginId,
    syncSqlSnippetPluginGates,
} from '@/features/plugin/services/plugin-runtime-sync.service'
import {
    findPluginPreset,
    mergePresetIntoOverrides,
    normalizeReferencePresetId,
    PLUGIN_PRESET_DEFINITIONS,
    resolvePresetTargetState,
    summarizePresetImpact,
    type PluginPresetId,
} from '@/features/plugin/services/plugin-preset.service'
import {
    buildPluginConfigExport,
    downloadPluginConfigJson,
    mergeImportedPluginOverrides,
    parsePluginConfigImport,
} from '@/features/plugin/services/plugin-config.service'
import {
    exportPluginUsageSnapshot,
    mergeImportedPluginUsage,
    recordPluginToggle,
} from '@/features/plugin/services/plugin-usage.service'
import {auditPluginCatalogConsistency} from '@/features/plugin/services/plugin-catalog-audit.service'
import {auditPluginCatalogMetadata} from '@/features/plugin/services/plugin-catalog-metadata.service'
import {listRegisteredPluginHooks} from '@/features/plugin/services/plugin-hook.service'
import {countReferencePresetConflicts} from '@/features/dashboard/services/dashboard-plugin-preset.service'
import {resolvePackForPlugin} from '@/features/pack/catalog/pack-catalog'
import {
    hasDevProductivityAccess,
    isDevProductivityPlugin,
} from '@/features/pack/services/dev-productivity-entitlement'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import type {PluginDevTab} from '@/features/plugin/components/PluginDeveloperToolsSection.vue'

/** 插件列表、启用状态（持久化到 app-config）与运行时门禁 */
export const usePluginStore = defineStore('plugin', () => {
    const catalog = ref<PluginItem[]>([])
    const ready = ref(false)
    const highlightPluginId = ref<string | null>(null)
    const pageNavigateIntent = ref<'none' | 'presetDiff'>('none')
    const devToolsPendingTab = ref<PluginDevTab | null>(null)
    const devToolsRequestedTab = ref<PluginDevTab | null>(null)
    const devToolsTabRevision = ref(0)
    const appConfig = useAppConfigStore()
    const toast = useAppToast()

    const pluginOverrides = computed(() => appConfig.config.plugins?.enabled ?? {})

    const items = computed(() =>
        mergePluginCatalog(catalog.value, pluginOverrides.value),
    )

    const enabledCount = computed(() => items.value.filter((item) => item.enabled).length)

    function isEnabled(id: PluginId | string): boolean {
        if (!resolvePluginEnabled(id, catalog.value, pluginOverrides.value)) return false
        const key = normalizePluginId(id)
        if (isDevProductivityPlugin(key)) {
            const entitlement = useEntitlementStore()
            return hasDevProductivityAccess({
                mode: entitlement.mode,
                suiteId: entitlement.suiteId,
            })
        }
        const packId = resolvePackForPlugin(key)
        if (!packId) return true
        // open mode → all packs usable; enforced → require pack
        return useEntitlementStore().isPackUsable(packId)
    }

    /** Plugin toggle only (ignores pack entitlement) — for free preview soft-gates. */
    function isSwitchEnabled(id: PluginId | string): boolean {
        return resolvePluginEnabled(id, catalog.value, pluginOverrides.value)
    }

    function applyRuntimeGates(id: string) {
        if (isSqlSnippetPluginId(normalizePluginId(id))) {
            syncSqlSnippetPluginGates(catalog.value, pluginOverrides.value)
        }
    }

    function syncAllRuntimeGates() {
        syncSqlSnippetPluginGates(catalog.value, pluginOverrides.value)
    }

    function showToggleToast(id: string, enabled: boolean) {
        const key = normalizePluginId(id)
        const nameKey = `plugin.items.${key}.name`
        const name = i18n.global.te(nameKey) ? i18n.global.t(nameKey) : key
        toast.success(
            enabled
                ? i18n.global.t('plugin.toggleEnabled', {name})
                : i18n.global.t('plugin.toggleDisabled', {name}),
        )
    }

    function closeDisabledShortcutPanels(overrides: Record<string, boolean>) {
        const layout = useLayoutStore()
        for (const [panel, pluginId] of Object.entries(SHORTCUT_PANEL_PLUGIN_MAP) as [ShortcutPanel, PluginId][]) {
            if (!resolvePluginEnabled(pluginId, catalog.value, overrides) && layout.activeShortcutPanel === panel) {
                layout.activeShortcutPanel = null
            }
        }
    }

    function applyPreset(presetId: PluginPresetId) {
        const preset = findPluginPreset(presetId)
        if (!preset) return

        const next = mergePresetIntoOverrides(pluginOverrides.value, preset)
        appConfig.patchPlugins({enabled: next, referencePresetId: presetId})
        syncAllRuntimeGates()
        closeDisabledShortcutPanels(next)

        const layout = useLayoutStore()
        if (!resolvePluginEnabled('p-ai-workbench', catalog.value, next) && layout.activeModule === 'ai') {
            layout.setModule('database')
        }

        toast.success(i18n.global.t(`plugin.presets.${presetId}.applied`))
    }

    function setReferencePresetId(presetId: PluginPresetId) {
        appConfig.patchPlugins({referencePresetId: presetId})
        toast.success(i18n.global.t('plugin.presets.referenceSet', {
            preset: i18n.global.t(`plugin.presets.${presetId}.label`),
        }))
    }

    function referencePresetId(): PluginPresetId {
        return normalizeReferencePresetId(appConfig.config.plugins?.referencePresetId)
    }

    function alignToReferencePreset(): number {
        const presetId = referencePresetId()
        const preset = findPluginPreset(presetId)
        if (!preset) return 0

        const impact = summarizePresetImpact(preset, isEnabled)
        if (impact.totalChanges === 0) {
            toast.show(i18n.global.t('plugin.presets.alignReferenceNone'))
            return 0
        }

        const next = mergePresetIntoOverrides(pluginOverrides.value, preset)
        appConfig.patchPlugins({enabled: next})
        syncAllRuntimeGates()
        closeDisabledShortcutPanels(next)

        const layout = useLayoutStore()
        if (!resolvePluginEnabled('p-ai-workbench', catalog.value, next) && layout.activeModule === 'ai') {
            layout.setModule('database')
        }

        toast.success(i18n.global.t('plugin.presets.alignReferenceApplied', {
            preset: i18n.global.t(`plugin.presets.${presetId}.label`),
            count: impact.totalChanges,
        }))
        return impact.totalChanges
    }

    function alignPluginToReferencePreset(id: PluginId, presetId: PluginPresetId): boolean {
        const preset = findPluginPreset(presetId)
        if (!preset) return false
        const target = resolvePresetTargetState(preset, id)
        if (target === undefined || isEnabled(id) === target) return false
        setEnabled(id, target)
        return true
    }

    function isSnippetLayerEnabled(layer: SqlSnippetLayerId): boolean {
        return resolveSqlSnippetLayerEnabled(layer, catalog.value, pluginOverrides.value)
    }

    function satisfyPluginRequires(id: PluginId): PluginId[] {
        const touched: PluginId[] = []
        for (const req of listPluginRequires(id)) {
            if (!isEnabled(req)) {
                setEnabled(req, true)
                touched.push(req)
            }
        }
        return touched
    }

    function exportPluginConfig() {
        downloadPluginConfigJson(
            buildPluginConfigExport(
                pluginOverrides.value,
                exportPluginUsageSnapshot(),
                normalizeReferencePresetId(appConfig.config.plugins?.referencePresetId),
            ),
        )
    }

    function importPluginConfig(text: string): boolean {
        let parsed: unknown
        try {
            parsed = JSON.parse(text)
        } catch {
            return false
        }
        const imported = parsePluginConfigImport(parsed)
        if (!imported) return false

        const merged = mergeImportedPluginOverrides(
            pluginOverrides.value,
            imported.enabled,
        )
        const patch: Partial<{enabled: Record<string, boolean>; referencePresetId: PluginPresetId}> = {
            enabled: merged,
        }
        if (imported.referencePresetId) {
            patch.referencePresetId = imported.referencePresetId
        }
        appConfig.patchPlugins(patch)
        if (imported.usage) mergeImportedPluginUsage(imported.usage)
        syncAllRuntimeGates()
        closeDisabledShortcutPanels(merged)

        const layout = useLayoutStore()
        if (!resolvePluginEnabled('p-ai-workbench', catalog.value, merged) && layout.activeModule === 'ai') {
            layout.setModule('database')
        }
        return true
    }

    function setEnabled(id: string, enabled: boolean) {
        const key = normalizePluginId(id)
        const nextEnabled = {...pluginOverrides.value, [key]: enabled}
        appConfig.patchPlugins({enabled: nextEnabled})
        applyRuntimeGates(key)
        recordPluginToggle(key, enabled)
        showToggleToast(key, enabled)

        const layout = useLayoutStore()
        if (key === 'p-ai-workbench' && !enabled && layout.activeModule === 'ai') {
            layout.setModule('database')
        }
        if (!enabled) {
            const panel = shortcutPanelForPlugin(key as PluginId)
            if (panel && layout.activeShortcutPanel === panel) {
                layout.activeShortcutPanel = null
            }
        }
    }

    function toggle(id: string) {
        const item = items.value.find((entry) => entry.id === normalizePluginId(id))
        if (!item) return
        setEnabled(item.id, !item.enabled)
    }

    async function load() {
        catalog.value = await pluginsApi.fetchAll()
        ready.value = true
        syncAllRuntimeGates()
    }

    function metaFor(id: string) {
        return PLUGIN_REGISTRY[id as PluginId]
    }

    function openTargetModule(
        module: NavModule | 'database' | 'settings' | null,
        settingsTab?: SettingsSection,
    ) {
        if (!module) return
        const layout = useLayoutStore()
        if (module === 'settings') {
            layout.openSettingsModule(settingsTab ?? 'basic')
            return
        }
        layout.setModule(module)
    }

    function openPluginTarget(id: PluginId) {
        const meta = PLUGIN_REGISTRY[id]
        if (!meta) return
        const layout = useLayoutStore()
        if (meta.openModule === 'settings') {
            layout.openSettingsModule(
                meta.settingsTab ?? resolvePluginSettingsTab(id) ?? PLUGIN_CENTER_SETTINGS_TAB,
            )
            return
        }
        if (meta.openModule === 'plugin') {
            layout.setModule('plugin')
            return
        }
        if (meta.openModule) {
            layout.setModule(meta.openModule)
            return
        }
        const settingsTab = resolvePluginSettingsTab(id)
        if (settingsTab) layout.openSettingsModule(settingsTab)
    }

    function focusPlugin(id: string) {
        highlightPluginId.value = normalizePluginId(id)
        openTargetModule('plugin')
    }

    function openPluginPresetDiff() {
        pageNavigateIntent.value = 'presetDiff'
        openTargetModule('plugin')
    }

    function clearPageNavigateIntent() {
        pageNavigateIntent.value = 'none'
    }

    function clearHighlight() {
        highlightPluginId.value = null
    }

    function resetPluginOverrides() {
        appConfig.patchPlugins({enabled: {}})
        syncAllRuntimeGates()
        closeDisabledShortcutPanels({})

        const layout = useLayoutStore()
        if (!resolvePluginEnabled('p-ai-workbench', catalog.value, {}) && layout.activeModule === 'ai') {
            layout.setModule('database')
        }
        toast.success(i18n.global.t('plugin.config.resetSuccess'))
    }

    const catalogItems = computed(() => catalog.value)

    const catalogAllIssueCount = computed(() => {
        const hooks = listRegisteredPluginHooks()
        return auditPluginCatalogConsistency(catalog.value, hooks).length
            + auditPluginCatalogMetadata(catalog.value).length
    })

    const isDevToolsVisible = computed(() => appConfig.isPluginDevToolsVisible())

    const referencePresetConflictCount = computed(() =>
        countReferencePresetConflicts(referencePresetId(), (id) => isEnabled(id)),
    )

    function openPackStore() {
        useLayoutStore().setModule('packStore')
    }

    function openPluginCenter() {
        useLayoutStore().setModule('plugin')
    }

    function openConnectorMarket() {
        useLayoutStore().setModule('connectorMarket')
    }

    function openPluginDevTools(tab?: PluginDevTab) {
        if (!isDevToolsVisible.value) {
            toast.show(i18n.global.t('plugin.devTools.hiddenHint'))
            return
        }
        if (tab) {
            devToolsPendingTab.value = tab
        } else if (catalogAllIssueCount.value > 0 || referencePresetConflictCount.value > 0) {
            devToolsPendingTab.value = 'audit'
        }
        useLayoutStore().setModule('pluginDev')
    }

    function consumeDevToolsTab(): PluginDevTab | null {
        const tab = devToolsPendingTab.value
        devToolsPendingTab.value = null
        return tab
    }

    function navigateDevToolsTab(tab: PluginDevTab) {
        if (!isDevToolsVisible.value) {
            toast.show(i18n.global.t('plugin.devTools.hiddenHint'))
            return
        }
        devToolsRequestedTab.value = tab
        devToolsTabRevision.value += 1
        if (useLayoutStore().activeModule !== 'pluginDev') {
            devToolsPendingTab.value = tab
            useLayoutStore().setModule('pluginDev')
        }
    }

    function consumeDevToolsTabRequest(): PluginDevTab | null {
        const tab = devToolsRequestedTab.value
        devToolsRequestedTab.value = null
        return tab
    }

    return {
        items,
        catalogItems,
        catalogAllIssueCount,
        isDevToolsVisible,
        referencePresetConflictCount,
        enabledCount,
        ready,
        highlightPluginId,
        pageNavigateIntent,
        load,
        toggle,
        setEnabled,
        isEnabled,
        isSwitchEnabled,
        isSnippetLayerEnabled,
        metaFor,
        openTargetModule,
        openPluginTarget,
        focusPlugin,
        openPluginPresetDiff,
        openPackStore,
        openPluginCenter,
        openConnectorMarket,
        openPluginDevTools,
        navigateDevToolsTab,
        consumeDevToolsTab,
        consumeDevToolsTabRequest,
        devToolsTabRevision,
        clearPageNavigateIntent,
        clearHighlight,
        syncAllRuntimeGates,
        applyPreset,
        setReferencePresetId,
        referencePresetId,
        alignToReferencePreset,
        alignPluginToReferencePreset,
        presetDefinitions: PLUGIN_PRESET_DEFINITIONS,
        exportPluginConfig,
        importPluginConfig,
        satisfyPluginRequires,
        resetPluginOverrides,
    }
})
