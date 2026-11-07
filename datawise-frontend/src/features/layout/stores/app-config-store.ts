/**
 * 应用配置 Store（Pinia）
 *
 * 统一管理应用配置：本地 localStorage 缓存 + 服务端 config 落盘。
 * 布局可见性、主题、编辑器、快捷键等写入 app.xml；
 * AI / explorer UI / window / localFiles / workspace tabs 写入独立 JSON；
 * SQL 片段走 sql-snippets API（不再镜像进 app.xml）。
 *
 * theme / editor / locale 运行时权威为专用 localStorage（见 docs/PREFERENCES_STORAGE.md）；
 * app.xml 内嵌字段作导入导出信封；服务端 sync 仅在专用 key 为空时 hydrate。
 * 设置页「导入/导出配置」亦经此 Store。
 */
import {defineStore} from 'pinia'
import {computed, ref, toRaw, watch} from 'vue'
import type {SettingsSection, ShortcutPanel} from '@/core/types'
import {currentLocale, hydrateLocaleFromEnvelope, setLocale, type AppLocale} from '@/i18n'
import {hydrateThemePreferencesFromEnvelope} from '@/shared/config/theme-preferences-storage'
import {hydrateEditorSettingsFromEnvelope} from '@/shared/config/editor-settings-storage'
import type {SideRailItemId} from '@/features/layout/constants/side-rail-nav'
import {SIDE_RAIL_NAV_DEFS} from '@/features/layout/constants/side-rail-nav'
import {SHORTCUT_RAIL_NAV_DEFS} from '@/features/layout/constants/shortcut-rail'
import {
    collectFirstLevelExpandedNodeIds,
} from '@/features/explorer/utils/tree-session'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useShortcutSettingsStore} from '@/features/settings/stores/shortcut-settings-store'
import {useSqlEditorShortcutsStore} from '@/features/settings/stores/sql-editor-shortcuts-store'
import {useEditorSettingsStore} from '@/features/settings/stores/editor-settings'
import {useThemeStore} from '@/features/settings/stores/theme-store'
import type {
    AiAnalysisLlmRouteStep,
    AppConfigFile,
    AiEmbeddingProfile,
    AiEmbeddingSettings,
    AiLlmProfile,
    AiPreferences,
    AiRagPreferences,
    ConnectionHealthPreferences,
    DangerousSqlPreferences,
    DashboardPreferences,
    ExplorerPreferences,
    LayoutPreferences,
    LocalFilesPreferences,
    PluginPreferences,
    RestorableNavModule,
    WindowPreferences
} from '@/shared/config/app-config.types'
import {
    createDefaultAppConfig,
    DEFAULT_AI_PREFERENCES,
    DEFAULT_AI_RAG_PREFERENCES,
    DEFAULT_CONNECTION_HEALTH_PREFERENCES,
    DEFAULT_DANGEROUS_SQL_PREFERENCES,
    DEFAULT_DASHBOARD_PREFERENCES,
    DEFAULT_EXPLORER_PREFERENCES,
    DEFAULT_PLUGIN_PREFERENCES
} from '@/shared/config/app-config.defaults'
import {normalizeDashboardPreferences} from '@/features/dashboard/services/dashboard-widget.service'
import type {DashboardPreferences as FeatureDashboardPreferences} from '@/features/dashboard/services/dashboard-widget.service'
import {createAiEmbeddingProfile, createAiLlmProfile} from '@/features/settings/constants/ai-presets'
import {aiApi} from '@/api'
import {mergePluginsOnAppConfigImport} from '@/features/plugin/services/plugin-app-config-merge.service'
import {
    isShortcutPanelEnabled,
    resolvePluginEnabled,
} from '@/features/plugin/services/plugin-registry.service'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {
    applyAppConfigFile,
    bootstrapSqlEditorLayersFromStoredAppConfig,
    exportAppConfigDownload,
    fetchAiPreferencesFromServer,
    fetchAppConfigFromServer,
    fetchExplorerUiFromServer,
    fetchLocalFilesFromServer,
    fetchWindowFromServer,
    fetchWorkspaceSessionFromServer,
    flushDetailConfigFilesToServer,
    isShortcutRailItemVisible,
    isSideRailItemVisible,
    migrateLegacyStorageKeysOnce,
    normalizeAppConfig,
    normalizeLocalFiles,
    parseAppConfigFile,
    persistAppConfig,
    pickAccessibleNavModule,
    readAppConfig,
    resolveHomeNavModule,
    sanitizeEditorSettings,
    schedulePersistAiPreferences,
    schedulePersistAppConfig,
    schedulePersistExplorerUi,
    schedulePersistLocalFiles,
    schedulePersistWindow,
    pushWorkspaceSessionToServer,
} from '@/shared/config/app-config.service'
import {readGuestFlag} from '@/shared/auth/session'
import {shouldSyncConfigToServer} from '@/shared/config/config-server-sync'
import {
    installOpenUrlClickDelegation,
    syncOpenHttpLinksIn,
} from '@/shared/browser/open-url'
import type {OpenHttpLinksIn} from '@/shared/config/app-config.types'
import {
    canAccessFeature,
    settingsSectionFeatureKey,
    shortcutFeatureKey,
    sideRailFeatureKey,
} from '@/features/auth/services/feature-permission.service'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {
    hydrateSqlEditorStorageFromAppConfigBody,
    syncSqlEditorLayersFromServer,
} from '@/features/settings/services/sql-editor-shortcuts.service'
import {sqlEditorShortcutsLayerHasOverrides} from '@datawise/sql-editor/config/snippets/layer-overrides'
import {getAppSqlEditorShortcutsController} from '@/features/settings/services/sql-editor-shortcuts.controller'
import {syncUpdatePreferencesFromServer} from '@/features/settings/services/about-settings.service'
import {useUpdateSettingsStore} from '@/features/settings/stores/update-settings'
import {setupDesktopWindowSync} from '@/features/layout/composables/useDesktopWindowSync'
import {toWindowStatePayload} from '@/features/layout/services/desktop-window-state.service'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'
import {ensureShortcutFloatContent} from '@/features/dock/services/ensure-shortcut-float-content'
import {
    DEFAULT_DOCK_FLOATS,
    DEFAULT_DOCK_PLACEMENT,
    type DockPlacement,
} from '@/features/dock/types/dock.types'

export const useAppConfigStore = defineStore('app-config', () => {
    migrateLegacyStorageKeysOnce()
    bootstrapSqlEditorLayersFromStoredAppConfig()

    const layout = useLayoutStore()
    const explorer = useExplorerStore()
    const workspace = useWorkspaceStore()
    const theme = useThemeStore()
    const editor = useEditorSettingsStore()
    const shortcutSettings = useShortcutSettingsStore()
    const sqlEditorShortcuts = useSqlEditorShortcutsStore()

    const config = ref<AppConfigFile>(readAppConfig())
    /** 结果面板展开状态仅会话内有效；配置加载时重置为收起 */
    const showConsoleResultPanel = ref(false)
    let syncing = false
    let lightPersistTimer: ReturnType<typeof setTimeout> | null = null
    const LIGHT_PERSIST_DELAY_MS = 320
    let workspaceSessionPersistTimer: ReturnType<typeof setTimeout> | null = null
    const WORKSPACE_SESSION_PERSIST_MS = 1_500

    /** 读 config 内插件开关，避免 init 期间 app-config ↔ plugin store 循环依赖 */
    function isPluginEnabledFromConfig(pluginId: string): boolean {
        return resolvePluginEnabled(pluginId, [], config.value.plugins?.enabled ?? {})
    }

    const preferences = computed(() => config.value.layout)
    const aiPreferences = computed(() => config.value.ai ?? DEFAULT_AI_PREFERENCES)
    const connectionHealthPreferences = computed(
        () => config.value.connectionHealth ?? DEFAULT_CONNECTION_HEALTH_PREFERENCES,
    )
    const dangerousSqlPreferences = computed(
        () => config.value.dangerousSql ?? DEFAULT_DANGEROUS_SQL_PREFERENCES,
    )
    const dashboardPreferences = computed(
        () => config.value.dashboard ?? DEFAULT_DASHBOARD_PREFERENCES,
    )

    const defaultLlmProfile = computed(() => {
        const ai = aiPreferences.value
        return ai.llmProfiles.find((profile) => profile.id === ai.defaultLlmId) ?? ai.llmProfiles[0]
    })

    const workbenchLlmProfile = computed(() => {
        const ai = aiPreferences.value
        const activeId = ai.workbenchLlmId || ai.defaultLlmId
        return ai.llmProfiles.find((profile) => profile.id === activeId) ?? ai.llmProfiles[0]
    })

    const defaultEmbeddingProfile = computed(() => {
        const ai = aiPreferences.value
        return ai.embeddingProfiles.find((profile) => profile.id === ai.defaultEmbeddingId)
            ?? ai.embeddingProfiles[0]
    })

    function patchAiPreferences(patch: Partial<AiPreferences>) {
        const next = {...aiPreferences.value, ...patch}
        config.value = {
            ...config.value,
            ai: next,
        }
        aiApi.syncPreferences(next)
        persistAppConfig(config.value)
        schedulePersistAiPreferences(next)
    }

    function replaceLlmProfiles(
        profiles: AiLlmProfile[],
        defaultLlmId?: string,
        workbenchLlmId?: string,
    ) {
        const nextDefault = defaultLlmId && profiles.some((profile) => profile.id === defaultLlmId)
            ? defaultLlmId
            : profiles[0]?.id ?? ''
        const currentWorkbench = aiPreferences.value.workbenchLlmId
        const nextWorkbench = workbenchLlmId && profiles.some((profile) => profile.id === workbenchLlmId)
            ? workbenchLlmId
            : profiles.some((profile) => profile.id === currentWorkbench)
                ? currentWorkbench
                : nextDefault
        patchAiPreferences({
            llmProfiles: profiles,
            defaultLlmId: nextDefault,
            workbenchLlmId: nextWorkbench,
        })
    }

    function updateLlmProfile(id: string, patch: Partial<AiLlmProfile>) {
        const profiles = aiPreferences.value.llmProfiles.map((profile) =>
            profile.id === id ? {...profile, ...patch, id: profile.id} : profile,
        )
        replaceLlmProfiles(profiles)
    }

    function addLlmProfile(name: string): string {
        const profile = createAiLlmProfile(name)
        replaceLlmProfiles([...aiPreferences.value.llmProfiles, profile])
        return profile.id
    }

    function removeLlmProfile(id: string) {
        const profiles = aiPreferences.value.llmProfiles
        if (profiles.length <= 1) return
        const nextProfiles = profiles.filter((profile) => profile.id !== id)
        const nextDefault = aiPreferences.value.defaultLlmId === id
            ? nextProfiles[0].id
            : aiPreferences.value.defaultLlmId
        const nextWorkbench = aiPreferences.value.workbenchLlmId === id
            ? nextProfiles[0].id
            : aiPreferences.value.workbenchLlmId
        replaceLlmProfiles(nextProfiles, nextDefault, nextWorkbench)
    }

    function setDefaultLlmProfile(id: string) {
        if (!aiPreferences.value.llmProfiles.some((profile) => profile.id === id)) return
        patchAiPreferences({defaultLlmId: id})
    }

    function setWorkbenchLlmProfile(id: string) {
        if (!aiPreferences.value.llmProfiles.some((profile) => profile.id === id)) return
        patchAiPreferences({workbenchLlmId: id})
    }

    function replaceEmbeddingProfiles(
        profiles: AiEmbeddingProfile[],
        defaultEmbeddingId?: string,
    ) {
        const nextDefault = defaultEmbeddingId && profiles.some((profile) => profile.id === defaultEmbeddingId)
            ? defaultEmbeddingId
            : profiles[0]?.id ?? ''
        patchAiPreferences({
            embeddingProfiles: profiles,
            defaultEmbeddingId: nextDefault,
        })
    }

    function updateEmbeddingProfile(id: string, patch: Partial<AiEmbeddingProfile>) {
        const profiles = aiPreferences.value.embeddingProfiles.map((profile) =>
            profile.id === id ? {...profile, ...patch, id: profile.id, useChatConnection: false} : profile,
        )
        replaceEmbeddingProfiles(profiles)
    }

    function addEmbeddingProfile(name: string): string {
        const profile = createAiEmbeddingProfile(name)
        replaceEmbeddingProfiles([...aiPreferences.value.embeddingProfiles, profile])
        return profile.id
    }

    function removeEmbeddingProfile(id: string) {
        const profiles = aiPreferences.value.embeddingProfiles
        if (profiles.length <= 1) return
        const nextProfiles = profiles.filter((profile) => profile.id !== id)
        const nextDefault = aiPreferences.value.defaultEmbeddingId === id
            ? nextProfiles[0].id
            : aiPreferences.value.defaultEmbeddingId
        replaceEmbeddingProfiles(nextProfiles, nextDefault)
    }

    function setDefaultEmbeddingProfile(id: string) {
        if (!aiPreferences.value.embeddingProfiles.some((profile) => profile.id === id)) return
        patchAiPreferences({defaultEmbeddingId: id})
    }

    function insertLlmProfile(profile: AiLlmProfile) {
        replaceLlmProfiles([...aiPreferences.value.llmProfiles, profile])
    }

    function insertEmbeddingProfile(profile: AiEmbeddingProfile) {
        replaceEmbeddingProfiles([...aiPreferences.value.embeddingProfiles, profile])
    }

    function patchRagPreferences(patch: Partial<AiRagPreferences>) {
        const current = toRaw(aiPreferences.value.rag ?? DEFAULT_AI_RAG_PREFERENCES)
        patchAiPreferences({
            rag: {
                ...current,
                ...patch,
                pgvector: patch.pgvector
                    ? {...toRaw(current.pgvector), ...patch.pgvector}
                    : toRaw(current.pgvector),
            },
        })
    }

    function persistConfigNow() {
        persistNow()
    }

    async function persistConfigNowAsync() {
        config.value = captureConfig()
        persistAppConfig(config.value, {immediateServer: true})
        try {
            await flushDetailConfigFilesToServer(config.value)
        } catch (error) {
            console.warn('[config] failed to flush detail config files', error)
        }
    }

    function setAiSideActivePanel(panel: AiPreferences['sideActivePanel']) {
        patchAiPreferences({sideActivePanel: panel})
    }

    function patchConnectionHealth(patch: Partial<ConnectionHealthPreferences>) {
        config.value = {
            ...config.value,
            connectionHealth: {...connectionHealthPreferences.value, ...patch},
        }
        persistSoon()
    }

    function patchDangerousSql(patch: Partial<DangerousSqlPreferences>) {
        config.value = {
            ...config.value,
            dangerousSql: {...dangerousSqlPreferences.value, ...patch},
        }
        persistSoon()
    }

    function patchDashboardPreferences(next: DashboardPreferences | FeatureDashboardPreferences) {
        config.value = {
            ...config.value,
            dashboard: normalizeDashboardPreferences(next),
        }
        persistSoon()
    }

    function resetDashboardPreferences() {
        patchDashboardPreferences(DEFAULT_DASHBOARD_PREFERENCES)
    }

    function patchPlugins(next: Partial<PluginPreferences>) {
        const current = config.value.plugins ?? DEFAULT_PLUGIN_PREFERENCES
        const plugins: PluginPreferences = {
            enabled: next.enabled !== undefined ? {...next.enabled} : {...current.enabled},
        }
        const referencePresetId =
            next.referencePresetId !== undefined ? next.referencePresetId : current.referencePresetId
        if (referencePresetId) plugins.referencePresetId = referencePresetId
        config.value = {
            ...config.value,
            plugins,
        }
        persistSoon()
    }

    function setLocalFilesPreferences(prefs: LocalFilesPreferences) {
        const next = normalizeLocalFiles(prefs)
        config.value = {
            ...config.value,
            localFiles: next,
        }
        persistAppConfig(config.value)
        schedulePersistLocalFiles(next)
    }

    /**
     * Snapshot live explorer prefs. Keep expandedNodeIds from config unless
     * explicitly overridden (manual root toggle via persistExplorerExpandedSoon).
     */
    function snapshotExplorerPreferences(
        overrides?: Partial<Pick<ExplorerPreferences, 'expandedNodeIds' | 'pinnedNodeIds'>>,
    ): ExplorerPreferences {
        return {
            selectedNodeId: explorer.selectedNodeId,
            searchQuery: explorer.searchQuery,
            expandedNodeIds: overrides?.expandedNodeIds ?? config.value.explorer?.expandedNodeIds ?? [],
            pinnedNodeIds: overrides?.pinnedNodeIds ?? [...explorer.pinnedNodeIds],
            showColumnComment: explorer.showColumnComment,
            showTableComment: explorer.showTableComment,
            showSemanticLayer: explorer.showSemanticLayer,
        }
    }

    function captureConfig(): AppConfigFile {
        // Detail sections stay in memory for UI / localStorage; server app.xml is summary-only
        // via toAppConfigSummary. Tabs live in workspace-session.json (exit flush).
        const prevWorkspace = config.value.workspace ?? {
            restoreSession: true,
            consoleEditorHeight: 400,
            showConsoleResultPanel: false,
        }
        return normalizeAppConfig({
            ...config.value,
            exportedAt: new Date().toISOString(),
            locale: currentLocale.value,
            theme: {
                appearance: theme.appearance,
                background: theme.backgroundTone,
                primary: theme.primaryTone,
                uiSkin: theme.uiSkin,
                uiFont: theme.uiFont,
                uiFontCustom: theme.uiFontCustom,
                uiTextScale: theme.uiTextScale,
                uiFontSizePx: theme.uiFontSizePx,
                uiDensity: theme.uiDensity,
            },
            editor: {...editor.settings},
            layout: snapshotLayoutPreferences(),
            // 展开态以 config 为准，勿从可能尚未就绪的树重算（启动/同步会清空根分组）。
            explorer: snapshotExplorerPreferences(),
            workspace: {
                restoreSession: prevWorkspace.restoreSession ?? true,
                consoleEditorHeight: prevWorkspace.consoleEditorHeight ?? 400,
                // 结果面板展开态不落盘；下次打开工作台始终从收起条开始
                showConsoleResultPanel: false,
            },
            profile: {
                name: layout.profileName,
                email: layout.profileEmail,
            },
            ai: aiPreferences.value,
            connectionHealth: connectionHealthPreferences.value,
            dangerousSql: dangerousSqlPreferences.value,
            dashboard: dashboardPreferences.value,
            shortcuts: shortcutSettings.snapshot(),
            // SQL editor shortcuts use dedicated sql-snippets files — do not mirror into app.xml.
        })
    }

    function persistSoon() {
        if (syncing) return
        config.value = captureConfig()
        schedulePersistAppConfig(config.value)
    }

    function resolvePersistedLastModule() {
        const module = layout.activeModule
        if (
            module === 'database'
            || module === 'dashboard'
            || module === 'ai'
            || module === 'packStore'
            || module === 'plugin'
            || module === 'communityPlugin'
            || module === 'pluginDev'
            || module === 'connectorMarket'
        ) {
            return resolveHomeNavModule(module as RestorableNavModule)
        }
        return config.value.layout.lastModule
    }

    function snapshotLayoutPreferences(): LayoutPreferences {
        const dock = useDockPlacementStore()
        return {
            ...config.value.layout,
            explorerWidth: explorer.width,
            showTerminalPanel: layout.showTerminalPanel,
            terminalHeight: layout.terminalHeight,
            lastModule: resolvePersistedLastModule(),
            lastShortcutPanel: layout.activeShortcutPanel,
            dockPlacement: {...dock.placement},
            dockTerminalFloat: {...dock.floats.terminal},
            dockExplorerFloat: {...dock.floats.explorer},
            dockShortcutFloat: {...dock.floats.shortcut},
            dockWorkspaceFloat: {...dock.floats.workspace},
        }
    }

    /** 导航/布局切换：只更新 layout，避免每次点击全量 capture 工作区 SQL。 */
    function scheduleLayoutPersist() {
        if (syncing) return
        if (lightPersistTimer) clearTimeout(lightPersistTimer)
        lightPersistTimer = setTimeout(() => {
            lightPersistTimer = null
            if (syncing) return
            config.value = {
                ...config.value,
                layout: snapshotLayoutPreferences(),
            }
            schedulePersistAppConfig(config.value)
        }, LIGHT_PERSIST_DELAY_MS)
    }

    /** Explorer 选中/搜索等：只更新 explorer 字段，不改动展开目录（仅手动展开/收起才写）. */
    function scheduleExplorerPersist() {
        if (syncing) return
        if (lightPersistTimer) clearTimeout(lightPersistTimer)
        lightPersistTimer = setTimeout(() => {
            lightPersistTimer = null
            if (syncing) return
            const explorerPrefs = snapshotExplorerPreferences()
            config.value = {
                ...config.value,
                explorer: explorerPrefs,
            }
            persistAppConfig(config.value)
            schedulePersistExplorerUi(explorerPrefs)
        }, LIGHT_PERSIST_DELAY_MS)
    }

    /** 仅在用户手动展开/收起根分组时，从树同步 expandedNodeIds 并落盘。 */
    function persistExplorerExpandedSoon() {
        if (syncing) return
        const explorerPrefs = snapshotExplorerPreferences({
            expandedNodeIds: collectFirstLevelExpandedNodeIds(explorer.tree),
        })
        config.value = {
            ...config.value,
            explorer: explorerPrefs,
        }
        persistAppConfig(config.value)
        schedulePersistExplorerUi(explorerPrefs)
    }

    function scheduleProfilePersist() {
        if (syncing) return
        if (lightPersistTimer) clearTimeout(lightPersistTimer)
        lightPersistTimer = setTimeout(() => {
            lightPersistTimer = null
            if (syncing) return
            config.value = {
                ...config.value,
                profile: {
                    name: layout.profileName,
                    email: layout.profileEmail,
                },
            }
            schedulePersistAppConfig(config.value)
        }, LIGHT_PERSIST_DELAY_MS)
    }

    function cancelPendingWorkspaceSessionPersist() {
        if (workspaceSessionPersistTimer) {
            clearTimeout(workspaceSessionPersistTimer)
            workspaceSessionPersistTimer = null
        }
    }

    /** Debounced mid-session persist so crash / kill / CEF dispose still keep recent tabs. */
    function scheduleWorkspaceSessionPersist() {
        if (syncing || readGuestFlag() || !shouldSyncConfigToServer()) return
        cancelPendingWorkspaceSessionPersist()
        workspaceSessionPersistTimer = setTimeout(() => {
            workspaceSessionPersistTimer = null
            if (syncing || readGuestFlag() || !shouldSyncConfigToServer()) return
            const session = workspace.captureSession()
            void pushWorkspaceSessionToServer({
                tabs: session.tabs,
                activeTabIndex: session.activeTabIndex >= 0 ? session.activeTabIndex : 0,
                tabGroups: session.tabGroups ?? [],
            }).catch((error) => {
                console.warn('[config] failed to persist workspace session', error)
            })
        }, WORKSPACE_SESSION_PERSIST_MS)
    }

    /** 真正退出/刷新：把当前打开的 tabs 写入 workspace-session.json。 */
    function flushWorkspaceSessionOnExit() {
        void flushWorkspaceSessionOnExitAsync()
    }

    /** Desktop close / Java quit handshake：等 session + app 汇总 + 明细文件写完再关窗。 */
    async function flushWorkspaceSessionOnExitAsync() {
        if (syncing) return
        if (lightPersistTimer) {
            clearTimeout(lightPersistTimer)
            lightPersistTimer = null
        }
        cancelPendingWorkspaceSessionPersist()
        const session = workspace.captureSession()
        config.value = captureConfig()
        persistAppConfig(config.value, {immediateServer: true})
        try {
            await Promise.all([
                pushWorkspaceSessionToServer({
                    tabs: session.tabs,
                    activeTabIndex: session.activeTabIndex >= 0 ? session.activeTabIndex : 0,
                    tabGroups: session.tabGroups ?? [],
                }),
                flushDetailConfigFilesToServer(config.value),
            ])
        } catch (error) {
            console.warn('[config] failed to flush workspace session on exit', error)
        }
    }

    async function restoreWorkspaceSessionFromServer() {
        const restore = config.value.workspace?.restoreSession !== false
        if (!restore) {
            workspace.closeAllClosable()
            return
        }
        const session = await fetchWorkspaceSessionFromServer()
        if (session?.tabs?.length) {
            workspace.restoreSession(session.tabs, session.activeTabIndex, session.tabGroups ?? [])
        } else {
            workspace.closeAllClosable()
        }
    }

    function persistNow() {
        config.value = captureConfig()
        persistAppConfig(config.value)
    }

    function isMainModuleAccessible(id: SideRailItemId, prefs: LayoutPreferences = preferences.value): boolean {
        if (!isSideRailItemVisible(prefs, id)) return false
        if (id === 'ai' && !isPluginEnabledFromConfig('p-ai-workbench')) return false
        const feature = sideRailFeatureKey(id)
        if (feature && !canAccessFeature(feature)) return false
        return true
    }

    function pickAccessibleModule(prefs: LayoutPreferences = preferences.value): RestorableNavModule {
        return pickAccessibleNavModule(prefs, (id) => isMainModuleAccessible(id, prefs))
    }

    function applyLayoutEffects(next: LayoutPreferences) {
        config.value = {...config.value, layout: next}
        syncOpenHttpLinksIn(next.openHttpLinksIn)
        installOpenUrlClickDelegation()
        explorer.width = next.explorerWidth
        layout.showTerminalPanel = next.showTerminalPanel
        layout.setTerminalHeight(next.terminalHeight)
        const dock = useDockPlacementStore()
        dock.applyPlacement(next.dockPlacement ?? DEFAULT_DOCK_PLACEMENT)
        dock.applyFloat('terminal', next.dockTerminalFloat ?? DEFAULT_DOCK_FLOATS.terminal)
        dock.applyFloat('explorer', next.dockExplorerFloat ?? DEFAULT_DOCK_FLOATS.explorer)
        dock.applyFloat('shortcut', next.dockShortcutFloat ?? DEFAULT_DOCK_FLOATS.shortcut)
        dock.applyFloat('workspace', next.dockWorkspaceFloat ?? DEFAULT_DOCK_FLOATS.workspace)
        // Defer: ensureShortcutFloatContent reads this store; sync call during
        // applyFullConfig bootstrap can see an unfinished pinia instance.
        if (dock.shortcutSide === 'float') {
            queueMicrotask(() => ensureShortcutFloatContent())
        }

        const shortcutStripOn = next.showShortcutRailStrip !== false
        // Do not force-reopen lastShortcutPanel on every layout patch (side-rail /
        // explorer toggles used to resurrect the drawer and look like "no effect").
        if (!shortcutStripOn) {
            layout.activeShortcutPanel = null
        } else if (
            layout.activeShortcutPanel
            && !isShortcutAccessible(layout.activeShortcutPanel, next)
        ) {
            layout.activeShortcutPanel = null
        }

        const module = pickAccessibleModule(next)
        if (layout.activeModule !== 'settings' && layout.activeModule !== 'team') {
            layout.setModule(module)
        }

        if (!isSideRailItemVisible(next, 'notify')) layout.showNotificationDrawer = false
        if (!isSideRailItemVisible(next, 'assistant')) layout.showAssistantDrawer = false
        if (!isSideRailItemVisible(next, 'terminal') && layout.showTerminalPanel) {
            layout.closeTerminalPanel()
        }
    }

    function applyLayoutState(next: LayoutPreferences) {
        applyLayoutEffects(next)
        // Flush layout immediately so a pending persistSoon (old snapshot) cannot
        // overwrite chrome toggles a few hundred ms later.
        if (lightPersistTimer) {
            clearTimeout(lightPersistTimer)
            lightPersistTimer = null
        }
        if (syncing) return
        config.value = {
            ...config.value,
            layout: snapshotLayoutPreferences(),
        }
        schedulePersistAppConfig(config.value)
    }

    function applyFullConfig(next: AppConfigFile) {
        syncing = true
        const normalized = normalizeAppConfig(next)
        config.value = normalized

        applyAppConfigFile(normalized, {
            // Dedicated keys win; envelope hydrates only when empty (sql-editor-shortcuts pattern).
            applyLocale: (locale: AppLocale) => hydrateLocaleFromEnvelope(locale, setLocale),
            applyTheme: (themePrefs) => hydrateThemePreferencesFromEnvelope(
                themePrefs,
                (prefs) => theme.importPreferences(prefs),
            ),
            applyEditor: (settings) => hydrateEditorSettingsFromEnvelope(
                settings,
                (next) => editor.patchSettings(sanitizeEditorSettings(next)),
            ),
            applyWindow: (windowPrefs) => {
                config.value.window = windowPrefs
                // Desktop host already restored window-state.json; pushing config defaults
                // here causes visible resize flicker on every boot.
                if (!isDesktopApp()) {
                    void globalThis.window.datawise?.window?.setState?.(toWindowStatePayload(windowPrefs))
                }
            },
            applyLayout: (layoutPrefs) => applyLayoutEffects(layoutPrefs),
            applyExplorer: (explorerPrefs) => {
                explorer.selectedNodeId = explorerPrefs.selectedNodeId
                explorer.searchQuery = explorerPrefs.searchQuery
                explorer.showColumnComment = explorerPrefs.showColumnComment
                explorer.showTableComment = explorerPrefs.showTableComment
                explorer.showSemanticLayer = explorerPrefs.showSemanticLayer
                // Prefer durable app.xml pins; fall back to localStorage for one-time migration.
                if (explorerPrefs.pinnedNodeIds.length) {
                    explorer.replacePinnedNodeIds(explorerPrefs.pinnedNodeIds)
                } else {
                    explorer.refreshPinnedNodeIds()
                }
                // 树未就绪时只保留 config；就绪后再应用到 UI。
                if (explorer.treeReady && explorer.tree.length) {
                    explorer.restoreExpandedNodes(explorerPrefs.expandedNodeIds)
                    explorer.reapplyPinnedSort()
                }
            },
            applyWorkspace: (workspacePrefs) => {
                config.value.workspace = {
                    ...workspacePrefs,
                    showConsoleResultPanel: false,
                }
                showConsoleResultPanel.value = false
                // Open tabs restore from workspace-session.json in syncFromServer /
                // restoreWorkspaceSessionFromServer — not from app.xml.
            },
            applyProfile: (profile) => {
                layout.profileName = profile.name
                layout.profileEmail = profile.email
            },
            applyShortcuts: (shortcuts) => shortcutSettings.applyPreferences(shortcuts),
            // Dedicated LS keys are the runtime authority. Hydrate only when those
            // keys are empty — never let app.xml / defaults wipe personal settings.
            applySqlEditorShortcutsShared: (shortcuts) => hydrateSqlEditorStorageFromAppConfigBody({
                sqlEditorShortcutsShared: shortcuts,
            }),
            applySqlEditorShortcuts: (shortcuts) => hydrateSqlEditorStorageFromAppConfigBody({
                sqlEditorShortcuts: shortcuts,
            }),
        })

        const dock = useDockPlacementStore()
        // Repair piled/oversized floats, then keep all floats inside the current viewport.
        const floatsRepaired = dock.repairLoadedFloats() || dock.syncFloatsToViewport()
        if (floatsRepaired) {
            config.value = {
                ...config.value,
                layout: snapshotLayoutPreferences(),
            }
        }

        syncing = false
        persistNow()
        getAppSqlEditorShortcutsController().reloadFromPersistence()
        aiApi.syncPreferences(config.value.ai ?? DEFAULT_AI_PREFERENCES)
        // Local-files store may already exist with empty prefs from pre-sync setup.
        void import('@/features/local-files/stores/local-files-store')
            .then(({useLocalFilesStore}) => {
                useLocalFilesStore().hydratePreferences()
            })
            .catch(() => {
                /* ignore — feature chunk optional during early boot */
            })
    }

    applyFullConfig(config.value)

    aiApi.syncPreferences(config.value.ai ?? DEFAULT_AI_PREFERENCES)

    setupDesktopWindowSync({
        getWindow: () => config.value.window,
        onWindowChange: (window: WindowPreferences) => {
            config.value.window = window
            persistAppConfig(config.value)
            schedulePersistWindow(window)
        },
        applyInitial: (window) => {
            config.value.window = window
        },
    })

    watch(() => explorer.width, () => scheduleLayoutPersist())
    watch(() => layout.showTerminalPanel, () => scheduleLayoutPersist())
    watch(() => layout.terminalHeight, () => scheduleLayoutPersist())
    watch(() => layout.activeModule, () => scheduleLayoutPersist())
    watch(() => layout.activeShortcutPanel, () => scheduleLayoutPersist())
    watch(
        () => useDockPlacementStore().floats,
        () => scheduleLayoutPersist(),
        {deep: true},
    )
    watch(() => explorer.selectedNodeId, () => scheduleExplorerPersist())
    watch(() => explorer.searchQuery, () => scheduleExplorerPersist())
    watch(() => explorer.showColumnComment, () => scheduleExplorerPersist())
    watch(() => explorer.showTableComment, () => scheduleExplorerPersist())
    watch(() => explorer.showSemanticLayer, () => scheduleExplorerPersist())
    watch(
        () => [...explorer.pinnedNodeIds].join('\0'),
        () => scheduleExplorerPersist(),
    )
    // 根分组展开只经 persistExplorerExpandedSoon 落盘；勿 watch treeVersion（启动恢复会误写 app.xml）。
    // workspace session：退出必刷；运行中 debounce，避免进程被杀时丢 tabs。
    watch(
        () => [workspace.tabs, workspace.activeTabId, workspace.tabGroups] as const,
        () => scheduleWorkspaceSessionPersist(),
        {deep: true},
    )
    watch(() => theme.appearance, () => persistSoon())
    watch(() => theme.backgroundTone, () => persistSoon())
    watch(() => theme.primaryTone, () => persistSoon())
    watch(() => theme.uiSkin, () => persistSoon())
    watch(() => theme.uiFont, () => persistSoon())
    watch(() => theme.uiFontCustom, () => persistSoon())
    watch(() => theme.uiTextScale, () => persistSoon())
    watch(() => theme.uiFontSizePx, () => persistSoon())
    watch(() => theme.uiDensity, () => persistSoon())
    watch(() => editor.settings, () => persistSoon(), {deep: true})
    watch(currentLocale, () => persistSoon())
    watch(() => layout.profileName, () => scheduleProfilePersist())
    watch(() => layout.profileEmail, () => scheduleProfilePersist())
    watch(() => shortcutSettings.bindings, () => persistSoon(), {deep: true})
    // SQL editor shortcuts persist via sql-editor-shortcuts.service — not app.xml.

    if (typeof window !== 'undefined') {
        const flushOnExit = () => flushWorkspaceSessionOnExit()
        window.addEventListener('pagehide', flushOnExit)
        window.addEventListener('beforeunload', flushOnExit)
        // Desktop Java quit calls this while the backend is still alive.
        ;(window as Window & {
            __datawiseFlushWorkspaceSession?: () => Promise<void>
        }).__datawiseFlushWorkspaceSession = () => flushWorkspaceSessionOnExitAsync()
    }

    const showSideRailStrip = computed(() => preferences.value.showSideRailStrip !== false)
    const showShortcutRailStrip = computed(() => preferences.value.showShortcutRailStrip !== false)

    function setShowSideRailStrip(visible: boolean) {
        const next = snapshotLayout()
        next.showSideRailStrip = visible
        applyLayoutState(next)
    }

    function setShowShortcutRailStrip(visible: boolean) {
        const next = snapshotLayout()
        next.showShortcutRailStrip = visible
        applyLayoutState(next)
        if (!visible) {
            layout.activeShortcutPanel = null
            layout.showNotificationDrawer = false
            return
        }
        // Menu label is「右侧栏」— don't leave the strip stuck as an off-screen float.
        const dock = useDockPlacementStore()
        if (dock.shortcutSide === 'float') {
            setDockPlacement({...dock.placement, shortcut: 'right'})
        }
    }

    const shortcutPanelWidth = computed(() => preferences.value.shortcutPanelWidth)
    const shortcutPanelMaxHeight = computed(() => preferences.value.shortcutPanelMaxHeight)
    const consoleEditorHeight = computed(() => config.value.workspace?.consoleEditorHeight ?? 400)

    function patchWorkspacePreferences(
        patch: Partial<NonNullable<AppConfigFile['workspace']>>,
    ) {
        config.value = {
            ...config.value,
            workspace: {
                ...(config.value.workspace ?? {
                    restoreSession: true,
                    consoleEditorHeight: 400,
                    showConsoleResultPanel: false,
                }),
                ...patch,
                // 不持久化展开态；磁盘侧始终保持收起
                showConsoleResultPanel: false,
            },
        }
        persistSoon()
    }

    function setConsoleEditorHeight(height: number) {
        patchWorkspacePreferences({consoleEditorHeight: height})
    }

    function setShowConsoleResultPanel(visible: boolean) {
        showConsoleResultPanel.value = visible
    }

    function setShortcutPanelWidth(width: number) {
        const next = {...snapshotLayout(), shortcutPanelWidth: width}
        config.value = {...config.value, layout: next}
        persistSoon()
    }

    function snapshotLayout(): LayoutPreferences {
        // Never structuredClone() the reactive Proxy — it throws DataCloneError and aborts
        // every chrome toggle before applyLayoutEffects runs.
        const layout = toRaw(preferences.value)
        return {
            ...layout,
            sideRailVisibility: {...toRaw(layout.sideRailVisibility)},
            shortcutRailVisibility: {...toRaw(layout.shortcutRailVisibility)},
        }
    }

    function isSideRailVisible(id: SideRailItemId) {
        const feature = sideRailFeatureKey(id)
        if (feature && !canAccessFeature(feature)) return false
        return isSideRailItemVisible(preferences.value, id)
    }

    /** 开发者工具入口（侧栏 Dev + Hero/命令面板/设置联动） */
    function isPluginDevToolsVisible() {
        return isSideRailVisible('pluginDev')
    }

    function isShortcutAccessible(
        id: ShortcutPanel,
        layoutPrefs: LayoutPreferences = preferences.value,
    ): boolean {
        if (!canAccessFeature(shortcutFeatureKey(id))) return false
        if (!isShortcutRailItemVisible(layoutPrefs, id)) return false
        return isShortcutPanelEnabled(id, isPluginEnabledFromConfig)
    }

    function isShortcutVisible(id: ShortcutPanel) {
        return isShortcutAccessible(id)
    }

    const hasShortcutRailItems = computed(() =>
        SHORTCUT_RAIL_NAV_DEFS.some((item) => isShortcutAccessible(item.id)),
    )
    const showShortcutRail = computed(
        () => showShortcutRailStrip.value && hasShortcutRailItems.value,
    )

    watch(showShortcutRail, (visible) => {
        if (visible) return
        if (layout.activeShortcutPanel) {
            layout.activeShortcutPanel = null
        }
    })

    function canOpenSettingsSection(section: SettingsSection): boolean {
        if (!canAccessFeature(FeaturePermission.NavSettings)) return false
        return canAccessFeature(settingsSectionFeatureKey(section))
    }

    function setSideRailVisible(id: SideRailItemId, visible: boolean) {
        const next = snapshotLayout()
        next.sideRailVisibility[id] = visible
        applyLayoutState(next)

        if (!visible) {
            if (id === 'terminal') layout.closeTerminalPanel()
            if (id === 'notify') layout.showNotificationDrawer = false
            if (id === 'assistant') layout.showAssistantDrawer = false
            if (
                (id === 'database' || id === 'dashboard' || id === 'ai' || id === 'packStore' || id === 'plugin' || id === 'pluginDev' || id === 'connectorMarket')
                && layout.activeModule === id
            ) {
                layout.setModule(pickAccessibleModule(next))
            }
        }
    }

    function setShortcutVisible(id: ShortcutPanel, visible: boolean) {
        const next = snapshotLayout()
        next.shortcutRailVisibility[id] = visible
        applyLayoutState(next)
        if (!visible && layout.activeShortcutPanel === id) {
            layout.activeShortcutPanel = null
        }
        if (!hasShortcutRailItems.value && layout.activeShortcutPanel) {
            layout.activeShortcutPanel = null
        }
    }

    function setShowExplorerPanel(visible: boolean) {
        const next = snapshotLayout()
        next.showExplorerPanel = visible
        applyLayoutState(next)
    }

    function setOpenHttpLinksIn(value: OpenHttpLinksIn) {
        const next = snapshotLayout()
        next.openHttpLinksIn = value === 'system' ? 'system' : 'builtin'
        applyLayoutState(next)
    }

    function setDockPlacement(next: DockPlacement) {
        const dock = useDockPlacementStore()
        dock.applyPlacement(next)
        // Snapshot live float rects from the dock store — preferences alone are stale
        // after in-drag patchFloat / place-on-float and would yank the window off-screen.
        applyLayoutState(snapshotLayoutPreferences())
    }

    /** Persist current dock placement + float rects without changing sides. */
    function persistDockLayout() {
        applyLayoutState(snapshotLayoutPreferences())
    }

    function resetDockPlacement() {
        useDockPlacementStore().resetToClassic()
        const layoutNext = snapshotLayout()
        layoutNext.dockPlacement = {...DEFAULT_DOCK_PLACEMENT}
        layoutNext.dockTerminalFloat = null
        layoutNext.dockExplorerFloat = null
        layoutNext.dockShortcutFloat = null
        layoutNext.dockWorkspaceFloat = null
        applyLayoutState(layoutNext)
    }

    function importConfigText(text: string): boolean {
        const file = parseAppConfigFile(text)
        if (!file) return false
        // Explicit import force-overlays dedicated keys (same as sql-editor layers below).
        if (file.theme) theme.importPreferences(file.theme)
        if (file.editor) editor.patchSettings(sanitizeEditorSettings(file.editor))
        if (file.locale === 'en-US' || file.locale === 'zh-CN') setLocale(file.locale)
        const merged: AppConfigFile = {
            ...file,
            plugins: mergePluginsOnAppConfigImport(config.value.plugins, file.plugins),
        }
        applyFullConfig(merged)
        // Import is explicit: overlay dedicated keys when the file carries SQL-editor layers.
        if (sqlEditorShortcutsLayerHasOverrides(merged.sqlEditorShortcuts)) {
            sqlEditorShortcuts.applyPersonal(merged.sqlEditorShortcuts)
        }
        if (sqlEditorShortcutsLayerHasOverrides(merged.sqlEditorShortcutsShared)) {
            sqlEditorShortcuts.applyShared(merged.sqlEditorShortcutsShared)
        }
        usePluginStore().syncAllRuntimeGates()
        void flushDetailConfigFilesToServer(config.value).catch((error) => {
            console.warn('[config] failed to flush detail files after import', error)
        })
        return true
    }

    function exportConfig() {
        exportAppConfigDownload(captureConfig())
    }

    function resetLayoutDefaults() {
        applyFullConfig(createDefaultAppConfig())
    }

    /** 一键专注：隐藏侧栏与结果面板，保留资源树便于查表写 SQL */
    function applyFocusMode() {
        const layout = useLayoutStore()
        applyLayoutState({
            ...snapshotLayout(),
            showSideRailStrip: false,
            showShortcutRailStrip: false,
            showExplorerPanel: true,
        })
        setShowConsoleResultPanel(false)
        layout.closeTerminalPanel()
        layout.showNotificationDrawer = false
        layout.showAssistantDrawer = false
        layout.activeShortcutPanel = null
    }

    async function syncFromServer() {
        if (readGuestFlag()) {
            // 访客无服务端 app.xml；主题/界面款式仍读本机 last-write（见 normalizeAppConfig）。
            applyFullConfig(normalizeAppConfig(createDefaultAppConfig()))
            workspace.closeAllClosable()
            await syncSqlEditorLayersFromServer()
            getAppSqlEditorShortcutsController().reloadFromPersistence()
            const updaterPrefs = await syncUpdatePreferencesFromServer()
            useUpdateSettingsStore().$patch({preferences: updaterPrefs})
            return
        }

        const [remote, aiRemote, explorerRemote, windowRemote, localFilesRemote] = await Promise.all([
            fetchAppConfigFromServer(),
            fetchAiPreferencesFromServer(),
            fetchExplorerUiFromServer(),
            fetchWindowFromServer(),
            fetchLocalFilesFromServer(),
        ])
        if (remote) {
            const localExpanded = config.value.explorer?.expandedNodeIds ?? []
            const remoteExplorer = explorerRemote ?? remote.explorer ?? DEFAULT_EXPLORER_PREFERENCES
            const remoteExpanded = remoteExplorer.expandedNodeIds ?? []
            // 远端已有展开态用远端；否则保留本地，避免空远端配置冲掉打开的根分组。
            const expandedNodeIds = remoteExpanded.length ? remoteExpanded : localExpanded
            applyFullConfig({
                ...remote,
                ai: aiRemote ?? remote.ai ?? DEFAULT_AI_PREFERENCES,
                explorer: {
                    ...remoteExplorer,
                    expandedNodeIds,
                },
                window: windowRemote ?? remote.window ?? config.value.window,
                localFiles: localFilesRemote ?? remote.localFiles ?? config.value.localFiles,
            })
        } else if (!readGuestFlag()) {
            config.value = captureConfig()
            persistAppConfig(config.value, {immediateServer: true})
            try {
                await flushDetailConfigFilesToServer(config.value)
            } catch (error) {
                console.warn('[config] failed to push local config on empty remote', error)
            }
        } else {
            applyFullConfig(readAppConfig())
        }
        await restoreWorkspaceSessionFromServer()
        await syncSqlEditorLayersFromServer()
        // LS 已更新 → 刷新 App controller / 全局 cache，否则编辑器仍读旧内存
        getAppSqlEditorShortcutsController().reloadFromPersistence()
        const updaterPrefs = await syncUpdatePreferencesFromServer()
        useUpdateSettingsStore().$patch({preferences: updaterPrefs})
    }

    function reloadForCurrentScope(next = readAppConfig()) {
        applyFullConfig(next)
    }

    const sideRailItems = computed(() =>
        SIDE_RAIL_NAV_DEFS.map((item) => ({
            ...item,
            visible: isSideRailItemVisible(preferences.value, item.id),
        })),
    )

    const shortcutRailItems = computed(() =>
        SHORTCUT_RAIL_NAV_DEFS.map((item) => ({
            ...item,
            visible: isShortcutAccessible(item.id),
        })),
    )

    function setSkipSqlConfirmation(value: boolean) {
        patchAiPreferences({skipSqlConfirmation: value})
    }

    function setDisabledAnalysisSteps(steps: AiPreferences['disabledAnalysisSteps']) {
        patchAiPreferences({disabledAnalysisSteps: steps ?? []})
    }

    function setAnalysisMode(mode: AiPreferences['analysisMode']) {
        patchAiPreferences({analysisMode: mode ?? 'smart'})
    }

    function setAnalysisStepLlmId(step: AiAnalysisLlmRouteStep, profileId: string) {
        const routes = {...(aiPreferences.value.analysisStepLlmIds ?? {})}
        const defaultId = aiPreferences.value.workbenchLlmId || aiPreferences.value.defaultLlmId
        if (!profileId || profileId === defaultId) {
            delete routes[step]
        } else if (aiPreferences.value.llmProfiles.some((profile) => profile.id === profileId)) {
            routes[step] = profileId
        } else {
            return
        }
        patchAiPreferences({
            analysisStepLlmIds: Object.keys(routes).length ? routes : undefined,
        })
    }

    return {
        config,
        preferences,
        aiPreferences,
        connectionHealthPreferences,
        patchConnectionHealth,
        dangerousSqlPreferences,
        patchDangerousSql,
        dashboardPreferences,
        patchDashboardPreferences,
        resetDashboardPreferences,
        defaultLlmProfile,
        workbenchLlmProfile,
        defaultEmbeddingProfile,
        showExplorerPanel: computed(() => preferences.value.showExplorerPanel !== false),
        showSideRailStrip,
        showShortcutRailStrip,
        hasShortcutRailItems,
        showShortcutRail,
        shortcutPanelWidth,
        shortcutPanelMaxHeight,
        consoleEditorHeight,
        showConsoleResultPanel,
        sideRailItems,
        shortcutRailItems,
        isSideRailVisible,
        isPluginDevToolsVisible,
        isShortcutVisible,
        canOpenSettingsSection,
        setSideRailVisible,
        setShortcutVisible,
        setShowExplorerPanel,
        setOpenHttpLinksIn,
        setDockPlacement,
        persistDockLayout,
        resetDockPlacement,
        setShowSideRailStrip,
        setShowShortcutRailStrip,
        setConsoleEditorHeight,
        setShowConsoleResultPanel,
        setShortcutPanelWidth,
        setAiSideActivePanel,
        addLlmProfile,
        updateLlmProfile,
        addEmbeddingProfile,
        updateEmbeddingProfile,
        insertLlmProfile,
        insertEmbeddingProfile,
        patchRagPreferences,
        persistConfigNow,
        persistConfigNowAsync,
        cancelPendingWorkspaceSessionPersist,
        flushWorkspaceSessionOnExit,
        flushWorkspaceSessionOnExitAsync,
        removeEmbeddingProfile,
        setDefaultEmbeddingProfile,
        removeLlmProfile,
        setDefaultLlmProfile,
        setWorkbenchLlmProfile,
        patchAiPreferences,
        setSkipSqlConfirmation,
        setDisabledAnalysisSteps,
        setAnalysisMode,
        setAnalysisStepLlmId,
        patchPlugins,
        setLocalFilesPreferences,
        exportConfig,
        importConfigText,
        resetLayoutDefaults,
        applyFocusMode,
        syncFromServer,
        reloadForCurrentScope,
        pickAccessibleModule,
        persistExplorerExpandedSoon,
    }
})
