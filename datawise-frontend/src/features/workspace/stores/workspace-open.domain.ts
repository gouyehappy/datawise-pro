/**
 * Workspace open commit domain (A-12): plan → reuse/create → activate + singleton opens.
 * Feature opens with side effects live in workspace-open-apps.domain.ts.
 */
import type {Ref} from 'vue'
import type {DbType, WorkspaceTab, WorkspaceTabType} from '@/core/types'
import {
    applyStatelessOpenPatches,
    type ConnectionOpenBase,
    type StatelessOpenDecision,
} from '@/features/workspace/services/workspace-stateless-open.service'
import {nextWorkspaceTabId} from '@/features/workspace/services/workspace-tab-id'
import {touchStatelessWorkspaceTab} from '@/features/workspace/services/workspace-tab-touch'
import {t} from '@/i18n'

export function connectionOpenLabel(
    connectionId: string,
    connectionName: string | undefined,
    resolveLabel: (id: string) => string | undefined,
): string | undefined {
    return connectionName ?? resolveLabel(connectionId)
}

export type WorkspaceOpenDomainDeps = {
    tabs: Ref<WorkspaceTab[]>
    activeTabId: Ref<string | null>
    resolveConnectionLabel: (connectionId: string) => string | undefined
}

export function createWorkspaceOpenDomain(deps: WorkspaceOpenDomainDeps) {
    function buildConnectionOpenBase(options: {
        connectionId: string
        connectionName?: string
        explorerNodeId?: string
    }): ConnectionOpenBase {
        return {
            connectionId: options.connectionId,
            connectionLabel: connectionOpenLabel(
                options.connectionId,
                options.connectionName,
                deps.resolveConnectionLabel,
            ),
            explorerNodeId: options.explorerNodeId,
        }
    }

    /**
     * Commit a planOpen* decision (reuse + patch, or create).
     * `touch` is optional for opens that do not wake a connector pool.
     */
    function openTab(
        decision: StatelessOpenDecision,
        touch?: {connectionId: string; kind: DbType},
    ): string {
        if ('reuse' in decision) {
            applyStatelessOpenPatches(decision.reuse, decision.patches)
            deps.activeTabId.value = decision.reuse.id
            if (touch) touchStatelessWorkspaceTab(touch.connectionId, touch.kind)
            return decision.reuse.id
        }
        const id = nextWorkspaceTabId(decision.create.type)
        deps.tabs.value.push({id, ...decision.create})
        deps.activeTabId.value = id
        if (touch) touchStatelessWorkspaceTab(touch.connectionId, touch.kind)
        return id
    }

    /**
     * Plan + commit in one step. Prefer this over one-off openXxx wrappers.
     * `TOptions` is the planOpen* options shape (ConnectionOpenBase fields + extras).
     */
    function openWithPlan<TOptions extends ConnectionOpenBase>(
        plan: (currentTabs: WorkspaceTab[], options: TOptions) => StatelessOpenDecision,
        options: {
            connectionId: string
            connectionName?: string
            explorerNodeId?: string
        } & Omit<TOptions, keyof ConnectionOpenBase>,
        kind: DbType,
    ): string {
        const base = buildConnectionOpenBase(options)
        const {connectionName: _ignored, ...rest} = options
        return openTab(plan(deps.tabs.value, {...rest, ...base} as TOptions), {
            connectionId: options.connectionId,
            kind,
        })
    }

    /** Reuse-or-create a single global tab of a given type (terminal / catalog / …). */
    function openSingletonTab(options: {
        type: WorkspaceTabType
        idPrefix: string
        title: string
        create?: Omit<Partial<WorkspaceTab>, 'id' | 'type' | 'title' | 'closable'>
        patchExisting?: (tab: WorkspaceTab) => void
    }): string {
        const existing = deps.tabs.value.find((tab) => tab.type === options.type)
        if (existing) {
            options.patchExisting?.(existing)
            deps.activeTabId.value = existing.id
            return existing.id
        }
        const id = nextWorkspaceTabId(options.idPrefix)
        deps.tabs.value.push({
            id,
            title: options.title,
            type: options.type,
            closable: true,
            ...options.create,
        })
        deps.activeTabId.value = id
        return id
    }

    function openTerminal() {
        return openSingletonTab({
            type: 'terminal',
            idPrefix: 'terminal',
            title: t('terminal.title'),
        })
    }

    function openDataCatalog() {
        return openSingletonTab({
            type: 'data_catalog',
            idPrefix: 'data-catalog',
            title: t('discovery.tabTitle'),
        })
    }

    function openSchemaCompare(options?: {
        left?: WorkspaceTab['schemaCompareLeft']
        right?: WorkspaceTab['schemaCompareRight']
    }) {
        return openSingletonTab({
            type: 'schema-compare',
            idPrefix: 'schema',
            title: t('schemaCompare.tabTitle'),
            create: {
                schemaCompareLeft: options?.left,
                schemaCompareRight: options?.right,
            },
            patchExisting: (tab) => {
                if (options?.left) tab.schemaCompareLeft = options.left
                if (options?.right) tab.schemaCompareRight = options.right
            },
        })
    }

    function openCrossEnvCompare(options?: {
        left?: WorkspaceTab['crossEnvCompareLeft']
        right?: WorkspaceTab['crossEnvCompareRight']
        sql?: string
    }) {
        return openSingletonTab({
            type: 'cross-env-compare',
            idPrefix: 'cross-env',
            title: t('crossEnvCompare.tabTitle'),
            create: {
                crossEnvCompareLeft: options?.left,
                crossEnvCompareRight: options?.right,
                crossEnvCompareSql: options?.sql?.trim() || undefined,
            },
            patchExisting: (tab) => {
                if (options?.left) tab.crossEnvCompareLeft = options.left
                if (options?.right) tab.crossEnvCompareRight = options.right
                if (options?.sql?.trim()) tab.crossEnvCompareSql = options.sql.trim()
            },
        })
    }

    /** Reuse-or-create by custom match (connection+database scoped tabs, …). */
    function openMatchedTab(options: {
        match: (tab: WorkspaceTab) => boolean
        idPrefix: string
        create: Omit<Partial<WorkspaceTab>, 'id'> & {
            type: WorkspaceTabType
            title: string
            closable: true
        }
        patchExisting?: (tab: WorkspaceTab) => void
        /** Called with the new tab id before the tab is pushed (e.g. paint gates). */
        beforeCreate?: (id: string) => void
    }): string {
        const existing = deps.tabs.value.find(options.match)
        if (existing) {
            options.patchExisting?.(existing)
            deps.activeTabId.value = existing.id
            return existing.id
        }
        const id = nextWorkspaceTabId(options.idPrefix)
        options.beforeCreate?.(id)
        deps.tabs.value.push({id, ...options.create})
        deps.activeTabId.value = id
        return id
    }

    function openTable(
        tableName: string,
        connectionId?: string,
        instanceId?: string,
        database?: string,
        explorerNodeId?: string,
        tableView?: NonNullable<WorkspaceTab['tableView']>,
        relationKind: NonNullable<WorkspaceTab['relationKind']> = 'table',
    ) {
        return openMatchedTab({
            match: (t) =>
                t.type === 'table'
                && t.tableName === tableName
                && t.connectionId === connectionId
                && (t.relationKind ?? 'table') === relationKind
                && (database ? t.database === database : t.instanceId === instanceId),
            idPrefix: 'table',
            create: {
                title: tableName,
                type: 'table',
                closable: true,
                tableName,
                connectionId,
                instanceId,
                database,
                explorerNodeId,
                tableView: tableView ?? 'properties',
                tableSection: 'columns',
                relationKind,
            },
            patchExisting: (existing) => {
                if (connectionId) existing.connectionId = connectionId
                if (instanceId) existing.instanceId = instanceId
                if (database) existing.database = database
                if (explorerNodeId) existing.explorerNodeId = explorerNodeId
                if (tableView) existing.tableView = tableView
                existing.relationKind = relationKind
            },
        })
    }

    function openViewModelData(options: {
        viewModelName: string
        viewModelSql: string
        connectionId: string
        instanceId?: string | null
        database?: string
        explorerNodeId?: string
    }) {
        return openMatchedTab({
            match: (tab) =>
                tab.type === 'view_model'
                && tab.viewModelName === options.viewModelName
                && tab.connectionId === options.connectionId
                && (options.database ? tab.database === options.database : tab.instanceId === options.instanceId),
            idPrefix: 'viewmodel',
            create: {
                title: options.viewModelName,
                type: 'view_model',
                closable: true,
                viewModelName: options.viewModelName,
                viewModelSql: options.viewModelSql,
                connectionId: options.connectionId,
                instanceId: options.instanceId,
                database: options.database,
                explorerNodeId: options.explorerNodeId,
            },
            patchExisting: (existing) => {
                existing.viewModelSql = options.viewModelSql
                if (options.explorerNodeId) existing.explorerNodeId = options.explorerNodeId
            },
        })
    }

    function openViewModelLineage(options: {
        viewModelName: string
        connectionId: string
        instanceId?: string | null
        database?: string
        explorerNodeId?: string
    }) {
        return openMatchedTab({
            match: (tab) =>
                tab.type === 'view_model_lineage'
                && tab.viewModelName === options.viewModelName
                && tab.connectionId === options.connectionId
                && (options.database ? tab.database === options.database : tab.instanceId === options.instanceId),
            idPrefix: 'lineage',
            create: {
                title: t('lineage.tabTitle', {name: options.viewModelName}),
                type: 'view_model_lineage',
                closable: true,
                viewModelName: options.viewModelName,
                connectionId: options.connectionId,
                instanceId: options.instanceId,
                database: options.database,
                explorerNodeId: options.explorerNodeId,
            },
            patchExisting: (existing) => {
                if (options.explorerNodeId) existing.explorerNodeId = options.explorerNodeId
            },
        })
    }

    function openViewModelMigration(options: {
        source: NonNullable<WorkspaceTab['migrationSource']>
        viewModelName: string
        sourceSelectSql: string
        targetTableName?: string
    }) {
        const id = nextWorkspaceTabId('migration')
        deps.tabs.value.push({
            id,
            title: t('tableMigration.tabTitleViewModel', {name: options.viewModelName}),
            type: 'table-migration',
            closable: true,
            migrationSource: options.source,
            migrationPreselectedTables: [options.viewModelName],
            migrationSourceSelectSql: options.sourceSelectSql,
            migrationTargetTableName: options.targetTableName,
            connectionId: options.source.connectionId,
            database: options.source.database,
        })
        deps.activeTabId.value = id
        return id
    }

    function openSchemaEr(options: {
        connectionId: string
        database: string
        instanceId?: string
        explorerNodeId?: string
        focusTableName?: string
    }) {
        return openMatchedTab({
            match: (tab) =>
                tab.type === 'schema-er'
                && tab.connectionId === options.connectionId
                && tab.database === options.database,
            idPrefix: 'schema-er',
            create: {
                title: t('workspace.schemaEr.tabTitle', {database: options.database}),
                type: 'schema-er',
                closable: true,
                connectionId: options.connectionId,
                database: options.database,
                instanceId: options.instanceId,
                explorerNodeId: options.explorerNodeId,
                tableName: options.focusTableName?.trim() || undefined,
            },
            patchExisting: (tab) => {
                if (options.instanceId) tab.instanceId = options.instanceId
                if (options.explorerNodeId) tab.explorerNodeId = options.explorerNodeId
                if (options.focusTableName?.trim()) tab.tableName = options.focusTableName.trim()
            },
        })
    }

    function openSchemaTables(options: {
        connectionId: string
        database: string
        instanceId?: string
        explorerNodeId?: string
    }) {
        return openMatchedTab({
            match: (tab) =>
                tab.type === 'schema-tables'
                && tab.connectionId === options.connectionId
                && tab.database === options.database,
            idPrefix: 'schema-tables',
            create: {
                title: t('workspace.schemaTables.tabTitle', {database: options.database}),
                type: 'schema-tables',
                closable: true,
                connectionId: options.connectionId,
                database: options.database,
                instanceId: options.instanceId,
                explorerNodeId: options.explorerNodeId,
            },
            patchExisting: (tab) => {
                if (options.instanceId) tab.instanceId = options.instanceId
                if (options.explorerNodeId) tab.explorerNodeId = options.explorerNodeId
            },
        })
    }

    function openMetadataDoc(options: {
        connectionId: string
        database: string
        instanceId?: string
        explorerNodeId?: string
        title?: string
        html?: string
        markdown?: string
        fileName?: string
        loading?: boolean
        loadError?: string
        detailsLoading?: boolean
    }) {
        return openMatchedTab({
            match: (tab) =>
                tab.type === 'metadoc'
                && tab.connectionId === options.connectionId
                && tab.database === options.database,
            idPrefix: 'metadoc',
            create: {
                title: options.title?.trim() || t('workspace.metadoc.tabTitle', {database: options.database}),
                type: 'metadoc',
                closable: true,
                connectionId: options.connectionId,
                database: options.database,
                instanceId: options.instanceId,
                explorerNodeId: options.explorerNodeId,
                metadocHtml: options.html ?? '',
                metadocMarkdown: options.markdown ?? '',
                metadocFileName: options.fileName ?? '',
                metadocView: 'preview',
                metadocLoading: options.loading ?? false,
                metadocLoadError: options.loadError ?? undefined,
                metadocDetailsLoading: options.detailsLoading ?? false,
            },
            patchExisting: (tab) => {
                tab.metadocHtml = options.html ?? tab.metadocHtml
                tab.metadocMarkdown = options.markdown ?? tab.metadocMarkdown
                tab.metadocFileName = options.fileName ?? tab.metadocFileName
                tab.metadocLoading = options.loading ?? false
                tab.metadocLoadError = options.loadError ?? undefined
                tab.metadocDetailsLoading = options.detailsLoading ?? tab.metadocDetailsLoading ?? false
                tab.metadocView = tab.metadocView ?? 'preview'
                if (options.instanceId) tab.instanceId = options.instanceId
                if (options.explorerNodeId) tab.explorerNodeId = options.explorerNodeId
                if (options.title?.trim()) tab.title = options.title.trim()
            },
        })
    }

    return {
        buildConnectionOpenBase,
        openTab,
        openWithPlan,
        openSingletonTab,
        openMatchedTab,
        openTerminal,
        openDataCatalog,
        openSchemaCompare,
        openCrossEnvCompare,
        openTable,
        openViewModelData,
        openViewModelLineage,
        openViewModelMigration,
        openSchemaEr,
        openSchemaTables,
        openMetadataDoc,
    }
}

export type WorkspaceOpenDomain = ReturnType<typeof createWorkspaceOpenDomain>
