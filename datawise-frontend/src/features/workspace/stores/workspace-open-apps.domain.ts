/**
 * Remaining workspace opens (A-12 finish): console, connection, community, platform, migration, view-model editor.
 * Composes over openMatchedTab / openWithPlan from the core open domain.
 */
import type {Ref} from 'vue'
import type {DbType, WorkspaceTab} from '@/core/types'
import type {PlatformFeatureId, PlatformScheduleDraft} from '@/shared/api/platform.types'
import {
    planOpenKafkaTablePublish,
    planOpenSshScriptRecord,
    planOpenSshTerminal,
    type ConnectionOpenBase,
    type StatelessOpenDecision,
} from '@/features/workspace/services/workspace-stateless-open.service'
import {
    currentWorkspaceTabCounter,
    nextWorkspaceTabId,
} from '@/features/workspace/services/workspace-tab-id'
import {
    getBoundConsoleSqlFile,
    resolveConsoleTabTitle,
    syncConsoleTabTitle,
} from '@/features/workspace/services/console-tab-title'
import {
    extractDataSources,
    findDataSource,
    pickDefaultDataSource,
    resolvePreferredConsoleInstance,
} from '@/features/explorer/utils/data-sources'
import {isCatalogSchemaDbType} from '@/features/explorer/services/explorer-lazy-load'
import {resolveNextScriptFileForOpen} from '@/features/explorer/services/sql-script.service'
import {resolveNextViewModelNameForOpen} from '@/features/explorer/services/view-model-open.service'
import {platformCatalogTabTitle} from '@/features/platform/services/platform-catalog.service'
import {
    isPlatformAiFeature,
    isPlatformGovernanceFeature,
} from '@/features/platform/services/platform-ai-feature'
import {
    isLocalAbsolutePath,
    localFileBaseName,
    localFileNodeId,
    normalizeLocalPathKey,
} from '@/features/local-files/services/local-files-path'
import {setTabParam} from '@/features/workspace/services/workspace-tab-params'
import {connectionOpenLabel} from '@/features/workspace/stores/workspace-open.domain'
import {t} from '@/i18n'

/** Replace or append SQL when reopening an existing console tab. */
function mergeOpenedConsoleSql(
    existing: string | undefined,
    incoming: string,
    append: boolean,
): string {
    if (!append) return incoming
    const base = (existing ?? '').replace(/\s+$/, '')
    const next = incoming.replace(/^\s+/, '').replace(/\s+$/, '')
    if (!base) return next
    if (!next) return base
    return `${base}\n\n${next}`
}

export type WorkspaceOpenAppsExplorer = {
    tree: unknown
    connectionHealthById: Record<string, unknown>
    pooledConnectionIds: Iterable<string> | Set<string> | string[]
    findNode: (id: string) => {label?: string; database?: string; dbType?: DbType} | null | undefined
    ensureChildrenLoaded: (connectionId: string) => Promise<void>
}

export type WorkspaceOpenAppsDeps = {
    tabs: Ref<WorkspaceTab[]>
    activeTabId: Ref<string | null>
    resolveConnectionLabel: (connectionId: string) => string | undefined
    getActiveTab: () => WorkspaceTab | null
    ensureConsoleQueryState: (tabId: string) => void
    getExplorer: () => WorkspaceOpenAppsExplorer
    openTab: (decision: StatelessOpenDecision, touch?: {connectionId: string; kind: DbType}) => string
    openWithPlan: <TOptions extends ConnectionOpenBase>(
        plan: (tabs: WorkspaceTab[], options: TOptions) => StatelessOpenDecision,
        options: {connectionId: string; connectionName?: string; explorerNodeId?: string} & Omit<
            TOptions,
            keyof ConnectionOpenBase
        >,
        kind: DbType,
    ) => string
    openMatchedTab: (options: {
        match: (tab: WorkspaceTab) => boolean
        idPrefix: string
        create: Omit<Partial<WorkspaceTab>, 'id'> & {
            type: WorkspaceTab['type']
            title: string
            closable: true
        }
        patchExisting?: (tab: WorkspaceTab) => void
        beforeCreate?: (id: string) => void
    }) => string
    setDatabaseModule: () => void
    canOpenConnectionForm: () => boolean
    onPermissionDenied: () => void
    onCommunityPluginCenterOpen?: (options?: {selectPluginId?: string; openSettings?: boolean}) => void
    beforeCommunityWorkbenchCreate?: (id: string) => void
    /** Evict oldest inactive community iframes before creating another (ENG-10). */
    ensureCommunityWorkbenchIframeCapacity?: () => void
    touchCommunityWorkbenchFocus?: (tabId: string) => void
    /** PERF-01: LRU order for shelled SQL consoles. */
    touchConsoleShellFocus?: (tabId: string) => void
    guardAiNav: () => boolean
    guardGovernancePack: (feature: PlatformFeatureId) => boolean
    readViewModel: (args: {
        connectionId: string
        instanceName: string
        name: string
    }) => Promise<{sql: string; draft?: boolean}>
    yieldFrame?: () => Promise<void>
}

function defaultYieldFrame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

export function createWorkspaceOpenAppsDomain(deps: WorkspaceOpenAppsDeps) {
    const yieldFrame = deps.yieldFrame ?? defaultYieldFrame

    function resolveOpenConsoleOptions(options?: {
        connectionName?: string
        connectionId?: string
        instanceId?: string | null
        database?: string
        sql?: string
        sqlFile?: string
        title?: string
        explorerNodeId?: string
        teamSharedQuery?: WorkspaceTab['teamSharedQuery']
    }) {
        const explorer = deps.getExplorer()
        const sources = extractDataSources(explorer.tree as never)
        const healthById = explorer.connectionHealthById as never

        let connectionId = options?.connectionId
        let instanceId = options?.instanceId
        let database = options?.database
        let connectionName = options?.connectionName

        if (!connectionId) {
            const active = deps.getActiveTab()
            if (active?.type === 'console' && active.connectionId) {
                connectionId = active.connectionId
                instanceId = instanceId ?? active.instanceId
                database = database ?? active.database
            } else {
                const defaultSource = pickDefaultDataSource(
                    sources,
                    healthById,
                    null,
                    explorer.pooledConnectionIds as never,
                )
                if (defaultSource) connectionId = defaultSource.id
            }
        }

        if (connectionId && !connectionName) {
            connectionName = deps.resolveConnectionLabel(connectionId)
        }

        const source = connectionId ? findDataSource(sources, connectionId) : undefined
        const connectionNode = connectionId ? explorer.findNode(connectionId) : undefined
        const catalogSchemaFamily = isCatalogSchemaDbType(connectionNode?.dbType)
        if (connectionId && instanceId == null) {
            const preferred = resolvePreferredConsoleInstance({
                configuredDatabase: database ?? connectionNode?.database,
                instances: source?.instances ?? [],
                fallbackToFirst: !catalogSchemaFamily && !database && !connectionNode?.database?.trim(),
            })
            if (preferred.instanceId) instanceId = preferred.instanceId
            if (preferred.database) database = preferred.database
        }

        return {
            ...options,
            connectionId,
            instanceId,
            database,
            connectionName,
        }
    }

    function ensureConsoleTabScriptFile(tab: WorkspaceTab) {
        if (tab.type !== 'console' || !tab.connectionId || getBoundConsoleSqlFile(tab)) return
        const explorer = deps.getExplorer()
        void resolveNextScriptFileForOpen({
            tabs: deps.tabs.value,
            connectionId: tab.connectionId,
            instanceId: tab.instanceId,
            instanceName: tab.database,
            tree: explorer.tree as never,
            excludeTabId: tab.id,
        }).then((fileName) => {
            const latest = deps.tabs.value.find((item) => item.id === tab.id)
            if (!latest || !latest.connectionId || getBoundConsoleSqlFile(latest)) return
            latest.sqlFile = fileName
            const nextTitle = syncConsoleTabTitle(
                latest,
                deps.resolveConnectionLabel(latest.connectionId),
            )
            if (nextTitle) latest.title = nextTitle
        })
    }

    async function openConsole(options?: {
        connectionName?: string
        connectionId?: string
        instanceId?: string | null
        database?: string
        sql?: string
        sqlFile?: string
        title?: string
        explorerNodeId?: string
        teamSharedQuery?: WorkspaceTab['teamSharedQuery']
        skipEnsureScriptFile?: boolean
        /**
         * When reusing an existing console tab, append `sql` after current content
         * instead of replacing it (e.g. generate-DML → open console).
         */
        appendSql?: boolean
    }) {
        const explorer = deps.getExplorer()
        const resolved = resolveOpenConsoleOptions(options)
        const appendSql = options?.appendSql === true

        if (resolved.connectionId) {
            const {touchRecentConnection} = await import(
                '@/features/workspace/services/welcome-recent-connections.service'
            )
            touchRecentConnection(resolved.connectionId)
            const sources = extractDataSources(explorer.tree as never)
            const source = findDataSource(sources, resolved.connectionId)
            if (!source?.instances.length) {
                await explorer.ensureChildrenLoaded(resolved.connectionId)
            }
        }

        const finalResolved = resolveOpenConsoleOptions({
            ...options,
            connectionId: resolved.connectionId,
            instanceId: resolved.instanceId,
            database: resolved.database,
            connectionName: resolved.connectionName,
        })

        const applySql = (existing: string | undefined, incoming: string) =>
            mergeOpenedConsoleSql(existing, incoming, appendSql)

        if (finalResolved.sqlFile && isLocalAbsolutePath(finalResolved.sqlFile)) {
            const existingLocal = deps.tabs.value.find(
                (item) => item.type === 'console' && item.sqlFile === finalResolved.sqlFile,
            )
            if (existingLocal) {
                if (finalResolved.sql !== undefined) {
                    existingLocal.sql = applySql(existingLocal.sql, finalResolved.sql)
                }
                if (finalResolved.explorerNodeId) existingLocal.explorerNodeId = finalResolved.explorerNodeId
                if (finalResolved.title && !appendSql) existingLocal.title = finalResolved.title
                if (!existingLocal.connectionId && finalResolved.connectionId) {
                    existingLocal.connectionId = finalResolved.connectionId
                    existingLocal.instanceId = finalResolved.instanceId
                    existingLocal.database = finalResolved.database
                }
                deps.activeTabId.value = existingLocal.id
                deps.ensureConsoleQueryState(existingLocal.id)
                return existingLocal.id
            }
        }

        if (finalResolved.connectionId && finalResolved.instanceId && finalResolved.sqlFile) {
            const existing = deps.tabs.value.find(
                (item) =>
                    item.type === 'console'
                    && item.connectionId === finalResolved.connectionId
                    && item.instanceId === finalResolved.instanceId
                    && item.sqlFile === finalResolved.sqlFile,
            )
            if (existing) {
                if (finalResolved.sql !== undefined) {
                    existing.sql = applySql(existing.sql, finalResolved.sql)
                }
                if (finalResolved.database !== undefined) existing.database = finalResolved.database
                if (finalResolved.explorerNodeId) existing.explorerNodeId = finalResolved.explorerNodeId
                if (!appendSql) {
                    const nextTitle = resolveConsoleTabTitle({
                        sqlFile: existing.sqlFile,
                        connectionName: finalResolved.connectionName,
                        kind: 'script',
                    })
                    if (nextTitle) existing.title = nextTitle
                }
                deps.activeTabId.value = existing.id
                deps.ensureConsoleQueryState(existing.id)
                return existing.id
            }
        }

        if (finalResolved.connectionId && finalResolved.instanceId && !finalResolved.sqlFile) {
            const existingPlaceholder = deps.tabs.value.find(
                (item) =>
                    item.type === 'console'
                    && item.connectionId === finalResolved.connectionId
                    && item.instanceId === finalResolved.instanceId
                    && !getBoundConsoleSqlFile(item),
            )
            if (existingPlaceholder) {
                if (finalResolved.sql !== undefined) {
                    existingPlaceholder.sql = applySql(existingPlaceholder.sql, finalResolved.sql)
                }
                if (finalResolved.database !== undefined) {
                    existingPlaceholder.database = finalResolved.database
                }
                if (finalResolved.explorerNodeId) {
                    existingPlaceholder.explorerNodeId = finalResolved.explorerNodeId
                }
                deps.activeTabId.value = existingPlaceholder.id
                deps.ensureConsoleQueryState(existingPlaceholder.id)
                if (!options?.skipEnsureScriptFile) {
                    ensureConsoleTabScriptFile(existingPlaceholder)
                }
                return existingPlaceholder.id
            }

            // Append into the working console even when it already has a script file.
            if (appendSql && finalResolved.sql !== undefined) {
                const candidates = deps.tabs.value.filter(
                    (item) =>
                        item.type === 'console'
                        && item.connectionId === finalResolved.connectionId
                        && item.instanceId === finalResolved.instanceId,
                )
                const activeId = deps.activeTabId.value
                const target =
                    candidates.find((item) => item.id === activeId)
                    ?? candidates[candidates.length - 1]
                if (target) {
                    target.sql = applySql(target.sql, finalResolved.sql)
                    if (finalResolved.database !== undefined) {
                        target.database = finalResolved.database
                    }
                    if (finalResolved.explorerNodeId) {
                        target.explorerNodeId = finalResolved.explorerNodeId
                    }
                    deps.activeTabId.value = target.id
                    deps.ensureConsoleQueryState(target.id)
                    return target.id
                }
            }
        }

        let sqlFile = finalResolved.sqlFile
        if (
            !sqlFile
            && finalResolved.connectionId
            && !options?.skipEnsureScriptFile
            && (finalResolved.database?.trim() || finalResolved.instanceId)
        ) {
            sqlFile = await resolveNextScriptFileForOpen({
                tabs: deps.tabs.value,
                connectionId: finalResolved.connectionId,
                instanceId: finalResolved.instanceId,
                instanceName: finalResolved.database,
                tree: explorer.tree as never,
            })
        }

        const id = nextWorkspaceTabId('console')
        const title =
            finalResolved.title
            ?? (sqlFile
                ? resolveConsoleTabTitle({
                    sqlFile,
                    connectionName: finalResolved.connectionName,
                    kind: 'script',
                })
                : resolveConsoleTabTitle({
                    connectionName: finalResolved.connectionName,
                    kind: 'console',
                }))
            ?? t('console.consoleTitle', {n: currentWorkspaceTabCounter()})
        const tab: WorkspaceTab = {
            id,
            title,
            type: 'console',
            closable: true,
            connectionId: finalResolved.connectionId,
            instanceId: finalResolved.instanceId,
            database: finalResolved.database,
            sql: finalResolved.sql ?? '',
            savedSql: finalResolved.sql ?? '',
            sqlFile,
            explorerNodeId: finalResolved.explorerNodeId,
            teamSharedQuery: finalResolved.teamSharedQuery,
        }
        await yieldFrame()
        deps.tabs.value.push(tab)
        deps.activeTabId.value = id
        deps.ensureConsoleQueryState(id)
        deps.touchConsoleShellFocus?.(id)
        if (!sqlFile && finalResolved.connectionId && !options?.skipEnsureScriptFile) {
            ensureConsoleTabScriptFile(tab)
        }
        return id
    }

    async function openLocalTextTab(options: {
        path: string
        content: string
        title?: string
        explorerNodeId?: string
    }) {
        const path = options.path.trim()
        if (!path) return null
        const existing = deps.tabs.value.find(
            (item) =>
                item.type === 'local-text'
                && item.localFilePath
                && normalizeLocalPathKey(item.localFilePath) === normalizeLocalPathKey(path),
        )
        if (existing) {
            existing.sql = options.content
            existing.savedContent = options.content
            if (options.explorerNodeId) existing.explorerNodeId = options.explorerNodeId
            if (options.title) existing.title = options.title
            deps.activeTabId.value = existing.id
            return existing.id
        }
        const id = nextWorkspaceTabId('local-text')
        const tab: WorkspaceTab = {
            id,
            title: options.title ?? localFileBaseName(path),
            type: 'local-text',
            closable: true,
            localFilePath: path,
            sql: options.content,
            savedContent: options.content,
            explorerNodeId: options.explorerNodeId ?? localFileNodeId(path),
        }
        await yieldFrame()
        deps.tabs.value.push(tab)
        deps.activeTabId.value = id
        return id
    }

    function openConnectionForm(
        dbType: DbType,
        options?: {
            connectionId?: string
            connectionName?: string
            groupId?: string
            pluginId?: string
            pluginConnectionProvider?: string
        },
    ): string | null {
        if (!deps.canOpenConnectionForm()) {
            deps.onPermissionDenied()
            return null
        }
        deps.setDatabaseModule()
        if (options?.connectionId) {
            const existing = deps.tabs.value.find(
                (tab) => tab.type === 'connection' && tab.connectionId === options.connectionId,
            )
            if (existing) {
                deps.activeTabId.value = existing.id
                return existing.id
            }
        }
        const id = nextWorkspaceTabId('connection')
        const title =
            options?.connectionId && options.connectionName
                ? t('connection.editTitle', {name: options.connectionName})
                : options?.pluginId
                  ? options.connectionName || options.pluginId
                  : t('console.newConnectionTitle', {dbType})
        deps.tabs.value.push({
            id,
            title,
            type: 'connection',
            closable: true,
            dbType,
            connectionId: options?.connectionId,
            targetGroupId: options?.groupId,
            pluginId: options?.pluginId,
            pluginConnectionProvider: options?.pluginConnectionProvider,
        })
        deps.activeTabId.value = id
        return id
    }

    function openCommunityPluginCenter(options?: {
        selectPluginId?: string
        openSettings?: boolean
    }): string {
        deps.setDatabaseModule()
        deps.onCommunityPluginCenterOpen?.(options)
        return deps.openMatchedTab({
            match: (tab) => tab.type === 'community-plugin-center',
            idPrefix: 'community-plugin-center',
            create: {
                title: t('communityPlugin.title'),
                type: 'community-plugin-center',
                closable: true,
            },
        })
    }

    function openCommunityWorkbench(
        pluginId: string,
        contributionId?: string,
        title?: string,
        options?: {
            connectionId?: string
            connection?: Record<string, unknown>
            workbenchInstanceId?: string
            pluginHostContext?: Record<string, unknown>
            forceNew?: boolean
        },
    ): string {
        deps.setDatabaseModule()
        const connectionId = options?.connectionId || (options?.connection?.id as string | undefined)
        const workbenchInstanceId = options?.workbenchInstanceId
        const hostContext =
            options?.pluginHostContext
            || (connectionId || options?.connection
                ? {
                      connectionId: connectionId || '',
                      workbenchId: workbenchInstanceId || crypto.randomUUID?.() || `wb-${Date.now()}`,
                      connection: options?.connection || {id: connectionId},
                      pluginId,
                  }
                : undefined)
        const match = (tab: WorkspaceTab) =>
            !options?.forceNew
            && tab.type === 'community-workbench'
            && tab.pluginId === pluginId
            && tab.pluginContributionId === contributionId
            && (workbenchInstanceId
                ? tab.pluginHostContext?.workbenchId === workbenchInstanceId
                : !connectionId || tab.connectionId === connectionId)
        const reusing = deps.tabs.value.some(match)
        if (!reusing) {
            deps.ensureCommunityWorkbenchIframeCapacity?.()
        }
        const id = deps.openMatchedTab({
            match,
            idPrefix: 'community-workbench',
            create: {
                title: title || `Workbench · ${pluginId}`,
                type: 'community-workbench',
                closable: true,
                pluginId,
                pluginContributionId: contributionId,
                connectionId,
                pluginHostContext: hostContext,
            },
            patchExisting: (existing) => {
                if (hostContext) existing.pluginHostContext = hostContext
                if (connectionId) existing.connectionId = connectionId
                if (title) existing.title = title
            },
            beforeCreate: (newId) => deps.beforeCommunityWorkbenchCreate?.(newId),
        })
        deps.touchCommunityWorkbenchFocus?.(id)
        return id
    }

    function openCommunityFilesystem(
        pluginId: string,
        providerId: string,
        rootUri?: string,
        title?: string,
    ): string {
        deps.setDatabaseModule()
        return deps.openMatchedTab({
            match: (tab) =>
                tab.type === 'community-filesystem'
                && tab.pluginId === pluginId
                && tab.pluginFilesystemProviderId === providerId,
            idPrefix: 'community-filesystem',
            create: {
                title: title || `Files · ${pluginId}`,
                type: 'community-filesystem',
                closable: true,
                pluginId,
                pluginFilesystemProviderId: providerId,
                pluginFilesystemRootUri: rootUri,
            },
        })
    }

    function openCreateNamespace(options: {
        connectionId: string
        connectionName?: string
        dbType?: DbType
        mode: 'database' | 'schema'
        catalog?: string
        hostLabel?: string
        explorerNodeId?: string
    }) {
        deps.setDatabaseModule()
        return deps.openMatchedTab({
            match: (tab) =>
                tab.type === 'create-database'
                && tab.connectionId === options.connectionId
                && tab.createNamespaceMode === options.mode
                && (tab.createNamespaceCatalog ?? '') === (options.catalog ?? ''),
            idPrefix: 'create-database',
            create: (() => {
                const seq = deps.tabs.value.filter((tab) => tab.type === 'create-database').length + 1
                const host = options.hostLabel?.trim()
                    || (options.connectionName ? options.connectionName : options.connectionId)
                const titleKey = options.mode === 'schema'
                    ? 'explorer.createNamespace.schemaTabTitle'
                    : 'explorer.createNamespace.databaseTabTitle'
                return {
                    title: t(titleKey, {n: seq, host}),
                    type: 'create-database' as const,
                    closable: true as const,
                    connectionId: options.connectionId,
                    dbType: options.dbType,
                    createNamespaceMode: options.mode,
                    createNamespaceCatalog: options.catalog,
                    createNamespaceHostLabel: host,
                    explorerNodeId: options.explorerNodeId ?? options.connectionId,
                }
            })(),
        })
    }

    function openKafkaTablePublish(options: {
        kafkaConnectionId?: string
        kafkaConnectionName?: string
        explorerNodeId?: string
        lockKafkaConnection?: boolean
        source?: {
            connectionId: string
            connectionLabel?: string
            database: string
            tableName: string
        }
    }) {
        const connectionId = options.kafkaConnectionId ?? options.source?.connectionId
        if (!connectionId) {
            throw new Error('openKafkaTablePublish: kafkaConnectionId or source.connectionId required')
        }
        return deps.openWithPlan(
            (currentTabs, opts) =>
                planOpenKafkaTablePublish(currentTabs, {
                    kafkaConnectionId: options.kafkaConnectionId,
                    kafkaConnectionLabel: opts.connectionLabel,
                    explorerNodeId: opts.explorerNodeId,
                    lockKafkaConnection: options.lockKafkaConnection,
                    source: options.source,
                }),
            {
                connectionId,
                connectionName: options.kafkaConnectionName ?? options.source?.connectionLabel,
                explorerNodeId: options.explorerNodeId,
            },
            'kafka',
        )
    }

    function openSshTerminal(options: {
        connectionId: string
        connectionName?: string
        explorerNodeId?: string
    }) {
        return deps.openWithPlan(planOpenSshTerminal, options, 'ssh')
    }

    function openSshScriptRecord(options: {
        connectionId: string
        connectionName?: string
        recordId: string
        title: string
        contentHtml?: string
        updatedAt?: number
        explorerNodeId?: string
    }) {
        const decision = planOpenSshScriptRecord(deps.tabs.value, {
            connectionId: options.connectionId,
            connectionLabel: connectionOpenLabel(
                options.connectionId,
                options.connectionName,
                deps.resolveConnectionLabel,
            ),
            explorerNodeId: options.explorerNodeId,
            recordId: options.recordId,
            title: options.title,
            contentHtml: options.contentHtml,
            updatedAt: options.updatedAt,
        })
        return deps.openTab(decision)
    }

    function openPlatformCatalog(options: {
        feature: PlatformFeatureId
        connectionId: string
        database: string
        instanceId?: string
        explorerNodeId?: string
        scheduleDraft?: PlatformScheduleDraft
        openCreateForm?: boolean
    }): string | null {
        if (isPlatformAiFeature(options.feature) && !deps.guardAiNav()) return null
        if (isPlatformGovernanceFeature(options.feature) && !deps.guardGovernancePack(options.feature)) {
            return null
        }
        return deps.openMatchedTab({
            match: (tab) =>
                tab.type === 'platform_catalog'
                && tab.params?.platformFeature === options.feature
                && tab.connectionId === options.connectionId
                && tab.database === options.database,
            idPrefix: 'platform-catalog',
            create: {
                title: platformCatalogTabTitle(options.feature, options.database, t),
                type: 'platform_catalog',
                closable: true,
                connectionId: options.connectionId,
                database: options.database,
                instanceId: options.instanceId,
                explorerNodeId: options.explorerNodeId,
                params: {
                    platformFeature: options.feature,
                    platformScheduleDraft: options.scheduleDraft,
                    platformOpenCreateForm: options.openCreateForm,
                },
            },
            patchExisting: (existing) => {
                if (options.instanceId) existing.instanceId = options.instanceId
                if (options.explorerNodeId) existing.explorerNodeId = options.explorerNodeId
                if (options.scheduleDraft) setTabParam(existing, 'platformScheduleDraft', options.scheduleDraft)
                if (options.openCreateForm) setTabParam(existing, 'platformOpenCreateForm', true)
            },
        })
    }

    function openTableMigration(options: {
        source: NonNullable<WorkspaceTab['migrationSource']>
        preselectedTables?: string[]
        initialTarget?: NonNullable<WorkspaceTab['migrationInitialTarget']>
    }) {
        const preselected = options.preselectedTables ?? []
        const title =
            preselected.length === 1
                ? t('tableMigration.tabTitleTable', {table: preselected[0]})
                : t('tableMigration.tabTitle', {database: options.source.database})
        return deps.openMatchedTab({
            match: (tab) =>
                tab.type === 'table-migration'
                && tab.migrationSource?.connectionId === options.source.connectionId
                && tab.migrationSource?.database === options.source.database,
            idPrefix: 'migration',
            create: {
                title,
                type: 'table-migration',
                closable: true,
                migrationSource: options.source,
                migrationPreselectedTables: preselected.length ? preselected : undefined,
                migrationInitialTarget: options.initialTarget,
                connectionId: options.source.connectionId,
                database: options.source.database,
            },
            patchExisting: (existing) => {
                if (options.preselectedTables?.length) {
                    existing.migrationPreselectedTables = [
                        ...new Set([
                            ...(existing.migrationPreselectedTables ?? []),
                            ...options.preselectedTables,
                        ]),
                    ]
                }
                if (options.initialTarget) {
                    existing.migrationInitialTarget = options.initialTarget
                }
            },
        })
    }

    async function openViewModelEditor(options: {
        connectionId: string
        instanceId?: string | null
        database?: string
        viewModelName?: string
        sql?: string
        explorerNodeId?: string
    }) {
        const database = options.database
        const viewModelName = options.viewModelName?.trim()
            || await resolveNextViewModelNameForOpen({
                tabs: deps.tabs.value,
                connectionId: options.connectionId,
                instanceId: options.instanceId,
                database,
            })

        const existing = deps.tabs.value.find(
            (tab) =>
                tab.type === 'view_model_editor'
                && tab.viewModelName === viewModelName
                && tab.connectionId === options.connectionId
                && (database ? tab.database === database : tab.instanceId === options.instanceId),
        )
        if (existing) {
            if (options.sql !== undefined) existing.viewModelSql = options.sql
            if (options.explorerNodeId) existing.explorerNodeId = options.explorerNodeId
            deps.activeTabId.value = existing.id
            return existing.id
        }

        let sql = options.sql ?? ''
        let isDraft = false
        if (options.sql === undefined && database) {
            try {
                const result = await deps.readViewModel({
                    connectionId: options.connectionId,
                    instanceName: database,
                    name: viewModelName,
                })
                sql = result.sql
                isDraft = Boolean(result.draft)
            } catch {
                sql = ''
            }
        }

        const id = nextWorkspaceTabId('vm-editor')
        deps.tabs.value.push({
            id,
            title: viewModelName,
            type: 'view_model_editor',
            closable: true,
            viewModelName,
            viewModelSql: sql,
            viewModelSavedSql: sql,
            viewModelIsDraft: isDraft,
            connectionId: options.connectionId,
            instanceId: options.instanceId,
            database,
            explorerNodeId: options.explorerNodeId,
        })
        deps.activeTabId.value = id
        return id
    }

    async function openViewModelConsole(options: {
        viewModelName: string
        sql: string
        connectionId: string
        connectionName?: string
        instanceId?: string | null
        database?: string
        explorerNodeId?: string
    }) {
        return openViewModelEditor({
            connectionId: options.connectionId,
            instanceId: options.instanceId,
            database: options.database,
            viewModelName: options.viewModelName,
            sql: options.sql,
            explorerNodeId: options.explorerNodeId,
        })
    }

    return {
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
    }
}

export type WorkspaceOpenAppsDomain = ReturnType<typeof createWorkspaceOpenAppsDomain>
