/**
 * Workspace 全局状态（Pinia Store）
 */
import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import type {StatusSnapshot, WorkspaceTab} from '@/core/types'
import {t} from '@/i18n'
import type {ConsoleQueryState} from '@/features/workspace/types'
import {
    type WorkspaceTabGroup,
} from '@/features/workspace/services/workspace-tab-layout.service'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {resolveConsoleInstanceLabel} from '@/features/workspace/services/resolve-console-instance'
import {
    buildConsoleTabTitleFromParts,
    formatSqlFileTabLabel,
    getBoundConsoleSqlFile,
    isSameConsoleTabLabel,
    parseConsoleTabTitle,
    resolveConsoleSqlFileName,
    resolveConsoleTabTitle,
    sqlFileNameFromTabLabel,
    syncConsoleTabTitle,
} from '@/features/workspace/services/console-tab-title'
import {
    resolveNextConsoleScriptFile,
} from '@/features/explorer/services/sql-script.service'
import {
    isLocalAbsolutePath,
    localFileBaseName,
} from '@/features/local-files/services/local-files-path'
import {writeLocalTextFile} from '@/features/local-files/services/local-files.service'
import {
    hydrateDiskBackedTabIfNeeded,
    softReloadDiskBackedTabOnActivate,
} from '@/features/local-files/services/local-files-tab-hydrate'
import {useLocalFilesStore} from '@/features/local-files/stores/local-files-store'
import {
    extractDataSources,
    findDataSource,
} from '@/features/explorer/utils/data-sources'
import {
    canSaveWorkspaceTab,
} from '@/features/workspace/utils/workspace-tab-dirty'
import {
    disposeSshTerminalHandle,
    disposeSshTerminalsForConnection as suspendSshTerminalsForConnection,
    getSshTerminalHandle,
} from '@/features/terminal/services/ssh-terminal-session.service'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {
    resolveConsoleWorkspaceInstance,
    resolveWorkspaceInstanceNodeId,
} from '@/features/workspace/services/console-workspace-instance'
import {createWorkspaceConsoleDomain} from '@/features/workspace/stores/workspace-console.domain'
import {createWorkspaceTabChromeDomain} from '@/features/workspace/stores/workspace-tab-chrome.domain'
import {createWorkspaceChromeSignalsDomain} from '@/features/workspace/stores/workspace-chrome-signals.domain'
import {
    createWorkspaceOpenDomain,
} from '@/features/workspace/stores/workspace-open.domain'
import {createWorkspaceOpenAppsDomain} from '@/features/workspace/stores/workspace-open-apps.domain'
import {createWorkspaceFloatDomain} from '@/features/workspace/stores/workspace-float.domain'
import {
    ensureCommunityWorkbenchIframeCapacity,
    forgetCommunityWorkbenchFocus,
    touchCommunityWorkbenchFocus,
} from '@/features/workspace/services/workspace-community-iframe.policy'
import {
    forgetConsoleShellFocus,
    touchConsoleShellFocus,
} from '@/features/workspace/services/workspace-console-shell.policy'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useCommunityPluginCenterUiStore} from '@/features/community-plugin/stores/community-plugin-center-ui'
import {beginCommunityWorkbenchPaint} from '@/features/community-plugin/lib/community-workbench-paint-gate'
import {canOpenConnectionCatalogForm} from '@/features/auth/services/feature-permission.service'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {explorerApi, instanceSqlApi} from '@/api'
import {viewModelApi} from '@/api/modules/view-model'
import {saveViewModelFromEditor} from '@/features/explorer/services/view-model-save.service'
import {saveSshScriptRecord} from '@/features/ssh/services/ssh-script-records.service'
import {notifySshScriptRecordsChanged} from '@/features/ssh/services/ssh-script-records-events'
import {
    parseCommandEntries,
} from '@/features/ssh/services/ssh-my-commands.service'
import {
    isValidViewModelBaseName,
    stripViewModelDisplayName,
} from '@/features/explorer/services/view-model-naming'
import {setTabParam} from '@/features/workspace/services/workspace-tab-params'

export type {ConsoleQueryState, QueryResultItem} from '@/features/workspace/types'

export const useWorkspaceStore = defineStore('workspace', () => {
    const tabs = ref<WorkspaceTab[]>([])
    const tabGroups = ref<WorkspaceTabGroup[]>([])
    const activeTabId = ref<string | null>(null)
    /** PERF-13: bump when tab content (sql/title/context) changes — session persist without deep watch. */
    const sessionPersistTick = ref(0)
    function bumpSessionPersistTick() {
        sessionPersistTick.value += 1
    }
    const status = ref<StatusSnapshot>({
        message: t('common.ready'),
        duration: '-',
        rowCount: '-',
    })
    const consoleQueryByTabId = ref<Record<string, ConsoleQueryState>>({})
    /** 控制台按 Tab 的执行中状态（切 Tab / remount 后仍可 Stop） */
    const consoleRunningByTabId = ref<Record<string, boolean>>({})
    /** 控制台执行世代：关 Tab / 重跑时递增，丢弃过期结果写回 */
    const consoleRunGenerationByTabId = ref<Record<string, number>>({})
    /** SSH 脚本 Tab 脏标记（组件内编辑态同步） */
    const sshScriptDirtyByTabId = ref<Record<string, boolean>>({})
    /** PERF-17: console/local-text dirty cache for Tab strip (avoids sql string compares). */
    const contentDirtyByTabId = ref<Record<string, boolean>>({})
    /** 表数据 Tab 假数据插入成功后递增，触发网格刷新 */
    const tableDataRefreshSeq = ref<Record<string, number>>({})
    /** Sticky tab 重新激活时递增，主机侧软刷新（文档 / 插件 / 连接表单等） */
    const tabActivateRefreshSeq = ref<Record<string, number>>({})
    /** 从表数据工具栏请求打开假数据对话框（WorkspaceTabs 监听） */
    const fakeDataDialogRequest = ref<{ tabId: string; nonce: number } | null>(null)
    /** 本地 SQL「打开并执行」：Console Tab 监听后触发 executeSql */
    const consoleAutoRunRequest = ref<{ tabId: string; nonce: number } | null>(null)
    /** B2-1: 查询模式侧栏 AI → 唤起控制台 AI 输入 */
    const consoleAiPromptRequest = ref<{ tabId: string; nonce: number } | null>(null)

    const activeTab = computed(() =>
        activeTabId.value ? tabs.value.find((t) => t.id === activeTabId.value) ?? null : null,
    )

    const hasOpenTabs = computed(() => tabs.value.length > 0)

    let activateTabFn: (tabId: string) => void = () => undefined

    const floatDomain = createWorkspaceFloatDomain({
        tabs,
        activeTabId,
        activateTab: (tabId) => activateTabFn(tabId),
        onCommunityWorkbenchFloated: touchCommunityWorkbenchFocus,
    })

    const {
        tabFloats,
        tabFloatSnapGuide,
        tabFloatOpacity,
        isTabFloated,
        floatedTabIds,
        getTabFloat,
        raiseTabFloat,
        patchTabFloat,
        clearTabFloat,
        resetAllTabFloats,
        floatTab,
        dockTab,
        setTabFloatSnapGuide,
        setTabFloatOpacity,
        relayoutMinimizedFloats,
        clampOpenTabFloatsToBounds,
        toggleTabFloatMinimized,
        toggleTabFloatMaximized,
        arrangeTabFloats,
        dockAllTabFloats,
    } = floatDomain

    function activateTab(tabId: string) {
        const previousId = activeTabId.value
        activeTabId.value = tabId
        if (tabFloats.value[tabId]) raiseTabFloat(tabId)
        // Soft-reload empty/unhydrated disk tabs; dirty buffers are left alone.
        void softReloadDiskBackedTabOnActivate(tabId)
        const tab = tabs.value.find((item) => item.id === tabId)
        // Re-activation (or first focus after another tab): nudge sticky hosts to refresh.
        if (tab && previousId !== tabId) {
            tabActivateRefreshSeq.value = {
                ...tabActivateRefreshSeq.value,
                [tabId]: (tabActivateRefreshSeq.value[tabId] ?? 0) + 1,
            }
            if (tab.type === 'ssh-terminal') {
                const handle = getSshTerminalHandle(tabId)
                const status = handle?.getStatus()
                if (handle && (status === 'disconnected' || status === 'error')) {
                    void handle.reconnect().catch(() => undefined)
                }
            }
        }
        if (tab?.type === 'community-workbench') {
            touchCommunityWorkbenchFocus(tabId)
        }
        if (tab?.type === 'console') {
            touchConsoleShellFocus(tabId)
        }
        const connectionId = tab?.connectionId
        if (!connectionId) return
        const explorer = useExplorerStore()
        if (!explorer.isConnectionPooled(connectionId)) return
        // 已连接源：切换 Tab 时轻量刷新活跃时间，不建新连接
        void explorerApi.touchConnection(connectionId).catch(() => undefined)
    }

    activateTabFn = activateTab

    function resolveConnectionLabel(connectionId: string) {
        const explorer = useExplorerStore()
        return (
            explorer.findNode(connectionId)?.label
            ?? findDataSource(extractDataSources(explorer.tree), connectionId)?.label
        )
    }

    const openDomain = createWorkspaceOpenDomain({
        tabs,
        activeTabId,
        resolveConnectionLabel,
    })

    const {
        openTab,
        openWithPlan,
        openMatchedTab,
        openTerminal,
        openDataCatalog,
        openSchemaCompare,
        openCrossEnvCompare,
        openSchemaEr,
        openSchemaTables,
        openMetadataDoc,
        openTable,
        openViewModelData,
        openViewModelLineage,
        openViewModelMigration,
    } = openDomain

    const chromeSignals = createWorkspaceChromeSignalsDomain({
        tabs,
        status,
        sshScriptDirtyByTabId,
        contentDirtyByTabId,
        tableDataRefreshSeq,
        tabActivateRefreshSeq,
        fakeDataDialogRequest,
        consoleAutoRunRequest,
        consoleAiPromptRequest,
    })

    const {
        setStatus,
        setExecutionResult,
        isTabDirty,
        syncContentDirtyFlag,
        clearContentDirtyFlag,
        setSshScriptDirty,
        bumpTableDataRefresh,
        requestFakeDataDialog,
        requestConsoleAutoRun,
        clearConsoleAutoRun,
        requestConsoleAiPrompt,
        clearConsoleAiPrompt,
    } = chromeSignals

    const consoleDomain = createWorkspaceConsoleDomain({
        consoleQueryByTabId,
        consoleRunningByTabId,
        consoleRunGenerationByTabId,
        setExecutionResult,
        onClearTabExtras: (tabId) => setSshScriptDirty(tabId, false),
    })

    const {
        isConsoleRunning,
        beginConsoleRun,
        endConsoleRun,
        isConsoleRunCurrent,
        invalidateConsoleRun,
        cancelConsoleExecutionBestEffort,
        ensureConsoleQueryState,
        getConsoleQueryState,
        setConsoleQueryResults,
        updateConsoleQueryResultAtIndex,
        appendConsoleQueryResultPage,
        recalculateConsoleExecutionTotals,
        setConsoleActiveView,
        closeConsoleQueryResult,
        closeOtherConsoleQueryResults,
        closeConsoleQueryResultsToLeft,
        closeConsoleQueryResultsToRight,
        getConsoleQueryResultLabel,
        renameConsoleQueryResult,
        closeAllConsoleQueryResults,
        resetConsoleQueryBag,
    } = consoleDomain

    /** Wired after tabChrome; used by community iframe capacity eviction (ENG-10). */
    let closeTabImpl: (tabId: string) => void = () => undefined

    const openApps = createWorkspaceOpenAppsDomain({
        tabs,
        activeTabId,
        resolveConnectionLabel,
        getActiveTab: () => activeTab.value,
        ensureConsoleQueryState,
        getExplorer: () => {
            const explorer = useExplorerStore()
            return {
                tree: explorer.tree,
                connectionHealthById: explorer.connectionHealthById,
                pooledConnectionIds: explorer.pooledConnectionIds,
                findNode: (id) => explorer.findNode(id),
                ensureChildrenLoaded: (connectionId) => explorer.ensureChildrenLoaded(connectionId),
            }
        },
        openTab,
        openWithPlan,
        openMatchedTab,
        setDatabaseModule: () => useLayoutStore().setModule('database'),
        canOpenConnectionForm: () => canOpenConnectionCatalogForm(useAuthStore().isGuest),
        onPermissionDenied: () => useLayoutStore().showErrorToast(t('auth.permissionDenied')),
        onCommunityPluginCenterOpen: (options) => {
            const ui = useCommunityPluginCenterUiStore()
            if (options?.selectPluginId) ui.requestSelectPlugin(options.selectPluginId)
            if (options?.openSettings) ui.requestOpenSettings()
        },
        beforeCommunityWorkbenchCreate: (id) => beginCommunityWorkbenchPaint(id),
        ensureCommunityWorkbenchIframeCapacity: () =>
            ensureCommunityWorkbenchIframeCapacity({
                tabs: tabs.value,
                activeTabId: activeTabId.value,
                closeTab: (tabId) => closeTabImpl(tabId),
            }),
        touchCommunityWorkbenchFocus,
        touchConsoleShellFocus,
        guardAiNav: () => useEntitlementStore().guardAiNav(),
        guardGovernancePack: (feature) =>
            useEntitlementStore().guardPack('pack.governance', `platform.${feature}`),
        readViewModel: (args) => viewModelApi.read(args),
    })

    const {
        openConsole,
        openLocalTextTab,
        openConnectionForm,
        openCommunityPluginCenter,
        openCommunityWorkbench,
        openCommunityFilesystem,
        openCreateNamespace,
        openKafkaTablePublish,
        openSshTerminal,
        openSshScriptRecord,
        openPlatformCatalog,
        openTableMigration,
        openViewModelEditor,
        openViewModelConsole,
        ensureConsoleTabScriptFile,
    } = openApps

    function clearTabLocalState(tabId: string) {
        consoleDomain.clearTabConsoleLocalState(tabId)
        forgetConsoleShellFocus(tabId)
        clearTabFloat(tabId)
        clearContentDirtyFlag(tabId)
    }

    function markConsoleTabSaved(tabId: string, sql?: string) {
        const tab = tabs.value.find((item) => item.id === tabId)
        if (!tab || tab.type !== 'console') return
        tab.savedSql = sql ?? tab.sql ?? ''
        syncContentDirtyFlag(tab)
    }

    async function saveConsoleTab(tabId: string): Promise<boolean> {
        const tab = tabs.value.find((item) => item.id === tabId)
        if (!tab || tab.type !== 'console') return false

        let fileName = getBoundConsoleSqlFile(tab)
        if (fileName && isLocalAbsolutePath(fileName)) {
            try {
                await writeLocalTextFile(fileName, tab.sql ?? '')
                markConsoleTabSaved(tabId)
                setStatus(t('explorer.localFiles.saved', {name: localFileBaseName(fileName)}))
                return true
            } catch {
                return false
            }
        }

        const {
            isProjectScriptUri,
            refreshProjectScriptsExplorerRoot,
            writeProjectScriptContent,
        } = await import('@/features/project/services/project-scripts.service')

        if (fileName && isProjectScriptUri(fileName)) {
            try {
                const written = await writeProjectScriptContent(fileName, tab.sql ?? '')
                if (!written) return false
                markConsoleTabSaved(tabId)
                setStatus(t('console.savedToWorkspace', {path: written.path}))
                void refreshProjectScriptsExplorerRoot()
                return true
            } catch {
                return false
            }
        }

        if (!fileName) {
            // Untitled consoles save under the connection instance workspace
            // (config/scripts/{connection}/{database}/), which appears as Explorer「工作区」.
            // Project scripts are only used when the tab is already bound to a project URI.
            const scope = resolveConsoleTabSaveScope(tab)
            if (!scope) return false
            fileName = await resolveNextConsoleScriptFile({
                connectionId: scope.connectionId,
                instanceName: scope.instanceName,
            })
            if (!fileName) return false
        }

        return persistConsoleTabSql(tab, fileName, {bindToTab: true})
    }

    /** 按 Tab 类型保存脏内容（关 Tab「保存」统一入口） */
    async function saveDirtyTab(tabId: string): Promise<boolean> {
        const tab = tabs.value.find((item) => item.id === tabId)
        if (!tab) return false
        if (tab.type === 'console') {
            return saveConsoleTab(tabId)
        }
        if (tab.type === 'local-text') {
            const path = tab.localFilePath?.trim()
            if (!path) return false
            try {
                const {isProjectFileUri, parseProjectFileUri, projectFilesApi} = await import(
                    '@/features/project/services/project-files-api'
                )
                if (isProjectFileUri(path)) {
                    const parsed = parseProjectFileUri(path)
                    if (!parsed) return false
                    await projectFilesApi.write(parsed.projectId, {
                        root: parsed.root,
                        path: parsed.path,
                        content: tab.sql ?? '',
                    })
                } else {
                    await writeLocalTextFile(path, tab.sql ?? '')
                    useLocalFilesStore().scheduleGitStatusRefresh()
                }
                tab.savedContent = tab.sql ?? ''
                syncContentDirtyFlag(tab)
                setStatus(t('explorer.localFiles.saved', {name: localFileBaseName(path)}))
                return true
            } catch {
                return false
            }
        }
        if (tab.type === 'view_model_editor') {
            const result = await saveViewModelFromEditor(
                tab,
                tab.viewModelSql ?? '',
                tab.database,
            )
            if (result.reason && result.outcome !== 'published' && result.reason !== 'single_select_required') {
                return false
            }
            tab.viewModelSavedSql = tab.viewModelSql ?? ''
            tab.viewModelIsDraft = result.outcome === 'draft'
            return true
        }
        if (tab.type === 'ssh-script-record') {
            const connectionId = tab.connectionId
            const recordId = tab.sshScriptRecordId
            if (!connectionId || !recordId) return false
            const stored = tab.sshScriptRecordHtml ?? ''
            const parsed = parseCommandEntries(stored)
            const nextTitle = (tab.sshScriptRecordTitle ?? tab.title).trim() || 'Untitled'
            try {
                const saved = await saveSshScriptRecord(connectionId, {
                    id: recordId,
                    title: nextTitle,
                    contentHtml: stored,
                    commands: parsed.commands,
                    updatedAt: Date.now(),
                })
                tab.title = saved.title
                tab.sshScriptRecordTitle = saved.title
                tab.sshScriptRecordHtml = saved.contentHtml ?? stored
                tab.sshScriptRecordUpdatedAt = saved.updatedAt
                setSshScriptDirty(tabId, false)
                notifySshScriptRecordsChanged(connectionId)
                return true
            } catch {
                return false
            }
        }
        return false
    }

    function canSaveDirtyTab(tabId: string): boolean {
        const tab = tabs.value.find((item) => item.id === tabId)
        if (!tab) return false
        return canSaveWorkspaceTab(tab)
    }

    async function saveConsoleStatementAsFile(tabId: string, statementSql: string): Promise<boolean> {
        const tab = tabs.value.find((item) => item.id === tabId)
        if (!tab || tab.type !== 'console') return false
        const sql = statementSql.trim()
        if (!sql) return false

        const scope = resolveConsoleTabSaveScope(tab)
        if (!scope) return false

        const fileName = await resolveNextConsoleScriptFile({
            connectionId: scope.connectionId,
            instanceName: scope.instanceName,
        })
        if (!fileName) return false
        return persistConsoleTabSql(tab, fileName, {bindToTab: false, sql})
    }

    async function saveConsoleTabAsMigration(tabId: string, fileName: string): Promise<boolean> {
        const tab = tabs.value.find((item) => item.id === tabId)
        if (!tab || tab.type !== 'console') return false
        const normalized = fileName.trim()
        if (!normalized) return false
        return persistConsoleTabSql(tab, normalized, {bindToTab: false})
    }

    function resolveConsoleTabSaveScope(tab: WorkspaceTab): {
        connectionId: string
        instanceName: string
        scopeNodeId: string | null | undefined
    } | null {
        const connectionId = tab.connectionId
        if (!connectionId) return null

        const explorer = useExplorerStore()
        const connectionNode = explorer.findNode(connectionId)
        const dbType = connectionNode?.dbType
        const instanceName = resolveConsoleWorkspaceInstance({
            dbType,
            sql: tab.sql ?? '',
            tabDatabase: tab.database,
            tree: explorer.tree,
            connectionId,
            selectedNodeId: explorer.selectedNodeId,
            findNode: (nodeId) => explorer.findNode(nodeId) ?? null,
        })
        if (!instanceName) return null

        const scopeNodeId = resolveWorkspaceInstanceNodeId(
            explorer.tree,
            connectionId,
            instanceName,
            dbType,
        )
        return {connectionId, instanceName, scopeNodeId: scopeNodeId ?? tab.instanceId}
    }

    async function persistConsoleTabSql(
        tab: WorkspaceTab,
        fileName: string,
        options: { bindToTab: boolean; sql?: string },
    ): Promise<boolean> {
        const scope = resolveConsoleTabSaveScope(tab)
        if (!scope) return false
        const sql = options.sql ?? tab.sql ?? ''
        // A new editor is empty until the user types. Saving it still creates the workspace file.
        if (!options.bindToTab && !sql.trim()) return false

        try {
            const result = await instanceSqlApi.save({
                connectionId: scope.connectionId,
                instanceName: scope.instanceName,
                sql,
                fileName,
            })
            if (options.bindToTab) {
                bindConsoleSqlFile(tab.id, result.fileName)
                updateTabContext(tab.id, {
                    connectionId: scope.connectionId,
                    database: scope.instanceName,
                    instanceId: scope.scopeNodeId ?? tab.instanceId,
                })
                markConsoleTabSaved(tab.id)
            }
            setStatus(t('console.savedToWorkspace', {path: result.relativePath}))
            try {
                const explorer = useExplorerStore()
                await explorer.reloadWorkspacesFolder(
                    scope.connectionId,
                    scope.instanceName,
                    scope.scopeNodeId ?? tab.instanceId,
                )
            } catch (reloadError) {
                console.error('[reloadWorkspacesFolder]', reloadError)
            }
            return true
        } catch (error) {
            console.error('[persistConsoleTabSql]', error)
            return false
        }
    }

    function disposeSshTerminalsForConnection(connectionId: string) {
        void suspendSshTerminalsForConnection(connectionId)
    }

    /** Close sidecar PTYs for a community-workbench tab (not KeepAlive — remount reattaches). */
    function disposeCommunityWorkbenchTab(tab: WorkspaceTab) {
        if (tab.type !== 'community-workbench') return
        forgetCommunityWorkbenchFocus(tab.id)
        const pluginId = tab.pluginId?.trim()
        const workbenchId =
            typeof tab.pluginHostContext?.workbenchId === 'string'
                ? tab.pluginHostContext.workbenchId.trim()
                : ''
        if (!pluginId || !workbenchId) return
        void import('@/shared/api/http/community-plugins')
            .then(({createHttpCommunityPluginsApi}) =>
                createHttpCommunityPluginsApi().invoke(pluginId, 'workbench/close', {workbenchId}),
            )
            .catch(() => undefined)
    }

    const tabChrome = createWorkspaceTabChromeDomain({
        tabs,
        tabGroups,
        activeTabId,
        cancelConsoleExecutionBestEffort,
        clearTabLocalState,
        disposeSshTerminal: (tabId) => {
            void disposeSshTerminalHandle(tabId)
        },
        disposeCommunityWorkbenchTab,
        resetConsoleQueryBag,
        ensureConsoleQueryState,
        hydrateDiskBackedTabIfNeeded,
    })

    const {
        closeTab,
        closeConsoleTabsForSqlFile,
        closeTableTabs,
        closeOthers,
        closeTabsToLeft,
        closeTabsToRight,
        closeAllClosable,
        getTabTitle,
        renameTab,
        dropTab,
        toggleTabGroupCollapsed,
        renameTabGroup,
        dissolveTabGroupById,
        restoreSession: restoreSessionBase,
        captureSession,
    } = tabChrome

    closeTabImpl = closeTab

    function restoreSession(
        ...args: Parameters<typeof restoreSessionBase>
    ) {
        resetAllTabFloats()
        const result = restoreSessionBase(...args)
        contentDirtyByTabId.value = {}
        for (const tab of tabs.value) syncContentDirtyFlag(tab)
        return result
    }

    async function renameConsoleTab(tabId: string, newLabel: string) {
        const tab = tabs.value.find((item) => item.id === tabId)
        if (!tab || tab.type !== 'console') return false

        const label = (() => {
            const parsedInput = parseConsoleTabTitle(newLabel)
            return (parsedInput.hasHostPrefix ? parsedInput.editableLabel : newLabel).trim()
        })()
        if (!label) return false

        const newBaseName = sqlFileNameFromTabLabel(label)
        if (!newBaseName) return false

        if (!tab.connectionId) return false

        const explorer = useExplorerStore()
        const instanceName = resolveConsoleInstanceLabel({
            tabInstanceId: tab.instanceId,
            tabDatabase: tab.database,
            findNodeLabel: (nodeId) => explorer.findNode(nodeId)?.label,
        })
        if (!instanceName) return false

        let currentFileName = resolveConsoleSqlFileName(tab)
        if (!currentFileName) {
            const saved = await saveConsoleTab(tabId)
            if (!saved) return false
            currentFileName = getBoundConsoleSqlFile(tab)
            if (!currentFileName) return false
        }

        const parsed = parseConsoleTabTitle(tab.title)
        const hostLabel = parsed.hostLabel

        if (isSameConsoleTabLabel(currentFileName, label)) {
            tab.title = resolveConsoleTabTitle({
                connectionHost: hostLabel,
                sqlFile: currentFileName,
                kind: 'script',
            }) ?? buildConsoleTabTitleFromParts(hostLabel, formatSqlFileTabLabel(currentFileName))
            if (!tab.database) tab.database = instanceName
            return true
        }

        try {
            // The tab may already be named Script-N.sql before the file exists on disk
            // (create raced, or an earlier save went to the project scripts folder).
            // Write first so rename has a source file.
            await instanceSqlApi.save({
                connectionId: tab.connectionId,
                instanceName,
                sql: tab.sql ?? '',
                fileName: currentFileName,
            })

            let result
            try {
                result = await instanceSqlApi.rename({
                    connectionId: tab.connectionId,
                    instanceName,
                    oldFileName: currentFileName,
                    newFileName: newBaseName,
                })
            } catch (renameError) {
                const message = renameError instanceof Error ? renameError.message : String(renameError)
                if (!/SQL file not found/i.test(message)) throw renameError
                result = await instanceSqlApi.save({
                    connectionId: tab.connectionId,
                    instanceName,
                    sql: tab.sql ?? '',
                    fileName: newBaseName.endsWith('.sql') ? newBaseName : `${newBaseName}.sql`,
                })
            }
            tab.sqlFile = result.fileName
            tab.database = instanceName
            tab.explorerNodeId = undefined
            tab.title = resolveConsoleTabTitle({
                connectionHost: hostLabel,
                sqlFile: result.fileName,
                kind: 'script',
            }) ?? buildConsoleTabTitleFromParts(hostLabel, formatSqlFileTabLabel(result.fileName))
            markConsoleTabSaved(tabId)
            return true
        } catch (error) {
            console.error('[renameConsoleTab]', error)
            return false
        }
    }

    async function renameViewModelTab(tabId: string, newName: string): Promise<boolean> {
        const tab = tabs.value.find((item) => item.id === tabId)
        if (!tab || tab.type !== 'view_model_editor') return false

        const trimmed = stripViewModelDisplayName(newName)
        if (!isValidViewModelBaseName(trimmed)) return false

        const oldName = tab.viewModelName?.trim() ?? tab.title.trim()
        if (oldName === trimmed) {
            tab.viewModelName = trimmed
            tab.title = trimmed
            return true
        }

        if (!tab.connectionId) return false
        const explorer = useExplorerStore()
        const instanceName = resolveConsoleInstanceLabel({
            tabInstanceId: tab.instanceId,
            tabDatabase: tab.database,
            findNodeLabel: (nodeId) => explorer.findNode(nodeId)?.label,
        })
        if (!instanceName) return false

        const hasPersisted = Boolean(tab.viewModelSavedSql?.trim())
        if (hasPersisted) {
            try {
                await viewModelApi.rename({
                    connectionId: tab.connectionId,
                    instanceName,
                    oldName,
                    newName: trimmed,
                })
                await explorer.reloadViewsFolder(tab.connectionId, instanceName, tab.instanceId)
            } catch (error) {
                console.error('[renameViewModelTab]', error)
                return false
            }
        }

        tab.viewModelName = trimmed
        tab.title = trimmed
        return true
    }

    function bindConsoleSqlFile(tabId: string, fileName: string) {
        const tab = tabs.value.find((item) => item.id === tabId)
        if (!tab || tab.type !== 'console') return
        tab.sqlFile = fileName
        tab.explorerNodeId = undefined
        const parsed = parseConsoleTabTitle(tab.title)
        const nextTitle = resolveConsoleTabTitle({
            connectionHost: parsed.hostLabel,
            sqlFile: fileName,
            kind: 'script',
        })
        if (nextTitle) tab.title = nextTitle
        markConsoleTabSaved(tabId)
    }

    function updateTabSql(tabId: string, sql: string) {
        const tab = tabs.value.find((item) => item.id === tabId)
        if (tab && tab.sql !== sql) {
            tab.sql = sql
            bumpSessionPersistTick()
            syncContentDirtyFlag(tab)
        }
    }

    function updateConsoleSqlFile(options: {
        connectionId: string
        instanceId: string
        oldFileName: string
        newFileName: string
        connectionName?: string
    }) {
        for (const tab of tabs.value) {
            if (
                tab.type !== 'console' ||
                tab.connectionId !== options.connectionId ||
                tab.instanceId !== options.instanceId ||
                tab.sqlFile !== options.oldFileName
            ) {
                continue
            }
            tab.sqlFile = options.newFileName
            const nextTitle = resolveConsoleTabTitle({
                connectionName: options.connectionName,
                sqlFile: options.newFileName,
                kind: 'script',
            })
            if (nextTitle) tab.title = nextTitle
            markConsoleTabSaved(tab.id)
        }
    }

    function updateTabContext(
        tabId: string,
        ctx: {
            connectionId?: string
            instanceId?: string | null
            database?: string
            explorerNodeId?: string | null
            kafkaTopic?: string
            tableName?: string
            tableSection?: NonNullable<WorkspaceTab['tableSection']>
        },
    ) {
        const tab = tabs.value.find((item) => item.id === tabId)
        if (!tab) return
        const prevConnectionId = tab.connectionId
        const prevInstanceId = tab.instanceId
        const prevDatabase = tab.database

        if (ctx.connectionId !== undefined) tab.connectionId = ctx.connectionId
        if (ctx.instanceId !== undefined) tab.instanceId = ctx.instanceId
        if (ctx.database !== undefined) tab.database = ctx.database
        if (ctx.explorerNodeId !== undefined) tab.explorerNodeId = ctx.explorerNodeId ?? undefined
        if (ctx.kafkaTopic !== undefined) setTabParam(tab, 'kafkaTopic', ctx.kafkaTopic)
        if (ctx.tableName !== undefined) {
            tab.tableName = ctx.tableName
            if (tab.type === 'mongo-console' && ctx.tableName) {
                tab.title = ctx.tableName
            }
        }
        if (ctx.tableSection !== undefined) tab.tableSection = ctx.tableSection

        const contextChanged =
            (ctx.connectionId !== undefined && ctx.connectionId !== prevConnectionId)
            || (ctx.instanceId !== undefined && ctx.instanceId !== prevInstanceId)
            || (ctx.database !== undefined && ctx.database !== prevDatabase)

        if (tab.type === 'console' && tab.connectionId && contextChanged && !getBoundConsoleSqlFile(tab)) {
            ensureConsoleTabScriptFile(tab)
            const nextTitle = syncConsoleTabTitle(tab, resolveConnectionLabel(tab.connectionId))
            if (nextTitle && nextTitle !== tab.title) tab.title = nextTitle
        }
    }

    return {
        tabs,
        tabGroups,
        activeTabId,
        sessionPersistTick,
        activeTab,
        tabFloats,
        tabFloatSnapGuide,
        tabFloatOpacity,
        hasOpenTabs,
        isTabFloated,
        floatedTabIds,
        getTabFloat,
        floatTab,
        dockTab,
        dockAllTabFloats,
        patchTabFloat,
        raiseTabFloat,
        clearTabFloat,
        toggleTabFloatMinimized,
        toggleTabFloatMaximized,
        arrangeTabFloats,
        setTabFloatSnapGuide,
        setTabFloatOpacity,
        relayoutMinimizedFloats,
        clampOpenTabFloatsToBounds,
        status,
        consoleQueryByTabId,
        tableDataRefreshSeq,
        tabActivateRefreshSeq,
        fakeDataDialogRequest,
        consoleAutoRunRequest,
        consoleAiPromptRequest,
        bumpTableDataRefresh,
        requestFakeDataDialog,
        requestConsoleAutoRun,
        clearConsoleAutoRun,
        requestConsoleAiPrompt,
        clearConsoleAiPrompt,
        activateTab,
        openTab,
        openWithPlan,
        openConsole,
        openLocalTextTab,
        openTable,
        openConnectionForm,
        openCommunityPluginCenter,
        openCommunityWorkbench,
        openCommunityFilesystem,
        openCreateNamespace,
        openTerminal,
        openSshTerminal,
        openSshScriptRecord,
        openSchemaCompare,
        openSchemaEr,
        openSchemaTables,
        openMetadataDoc,
        openPlatformCatalog,
        openDataCatalog,
        openCrossEnvCompare,
        openTableMigration,
        openViewModelData,
        openViewModelLineage,
        openViewModelEditor,
        openViewModelConsole,
        openViewModelMigration,
        openKafkaTablePublish,
        closeTab,
        disposeSshTerminalsForConnection,
        closeConsoleTabsForSqlFile,
        closeTableTabs,
        isTabDirty,
        syncContentDirtyFlag,
        canSaveDirtyTab,
        saveDirtyTab,
        setSshScriptDirty,
        isConsoleRunning,
        beginConsoleRun,
        endConsoleRun,
        isConsoleRunCurrent,
        invalidateConsoleRun,
        markConsoleTabSaved,
        saveConsoleTab,
        saveConsoleStatementAsFile,
        saveConsoleTabAsMigration,
        closeOthers,
        closeTabsToLeft,
        closeTabsToRight,
        getTabTitle,
        renameTab,
        dropTab,
        toggleTabGroupCollapsed,
        renameTabGroup,
        dissolveTabGroupById,
        renameConsoleTab,
        renameViewModelTab,
        bindConsoleSqlFile,
        closeAllClosable,
        setExecutionResult,
        getConsoleQueryState,
        setConsoleQueryResults,
        updateConsoleQueryResultAtIndex,
        appendConsoleQueryResultPage,
        recalculateConsoleExecutionTotals,
        setConsoleActiveView,
        closeConsoleQueryResult,
        closeOtherConsoleQueryResults,
        closeConsoleQueryResultsToLeft,
        closeConsoleQueryResultsToRight,
        getConsoleQueryResultLabel,
        renameConsoleQueryResult,
        closeAllConsoleQueryResults,
        updateTabSql,
        updateConsoleSqlFile,
        updateTabContext,
        setStatus,
        restoreSession,
        captureSession,
    }
})
