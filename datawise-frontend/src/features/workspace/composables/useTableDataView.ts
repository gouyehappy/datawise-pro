import {computed, onUnmounted, ref, watch} from 'vue'
import type {TableColumn, TableRow, TreeNode, WorkspaceTab} from '@/core/types'
import {findDatabaseLabel} from '@/core/utils/tree'
import {logPerf, perfNow} from '@/core/utils/perf-log'
import type {TableColumnDetail, TableDataResult, TablePropertiesResult} from '@/shared/api/types'
import type {GridPendingBatch} from '@/core/composables/useGridPendingEdit'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useTeamStore} from '@/features/team/stores/team-store'
import {canDmlConnection} from '@/features/team/services/connection-access.service'
import {sqlApi, tableDataApi, tableDetailApi} from '@/api'
import {resolveTableViewOptions} from '../services/table-data.service'
import {resolveSqlPageSize, resolveCursorLoadedRowsMax, resolveClientMaxResultRows} from '@/features/settings/services/query-limit.service'
import {appendCursorRowsWithWindow} from '@/features/workspace/services/query-result-cursor.service'
import {releaseSqlCursorsBestEffort} from '@/features/workspace/services/sql-cursor-release.service'
import {useProductionPerfMode} from '@/features/settings/composables/useProductionPerfMode'
import {
    buildRowMutateValues,
    resolvePrimaryKeyColumns,
} from '@/features/workspace/services/table-row-mutate.service'
import {useConnectionCapabilities} from '@/features/datasource/composables/useConnectionCapabilities'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {hasDevProductivityAccess} from '@/features/pack/services/dev-productivity-entitlement'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {normalizeMongoDocumentFilter} from '@/features/workspace/services/mongo-document-filter.service'
import {useI18n} from 'vue-i18n'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {ApiError} from '@/shared/api/http/api-error'
import {useLayoutStore} from '@/features/layout/stores/layout'

const EMPTY: TableDataResult = {columns: [], rows: []}
const EMPTY_PROPERTIES: TablePropertiesResult = {
    tableName: '',
    columns: [],
    foreignKeys: [],
    indexes: [],
}

function resolveDatabaseName(tab: WorkspaceTab, tree: TreeNode[]): string | undefined {
    if (tab.database?.trim()) return tab.database.trim()
    if (tab.instanceId) {
        return findDatabaseLabel(tree, tab.instanceId) ?? undefined
    }
    return undefined
}

/** 表数据 Tab：加载、刷新、批量提交新增/编辑/删除 */
export function useTableDataView(tab: WorkspaceTab) {
    const explorer = useExplorerStore()
    const teamStore = useTeamStore()
    const pluginStore = usePluginStore()
    const entitlement = useEntitlementStore()
    const workspace = useWorkspaceStore()
    const {t} = useI18n()
    const tableData = ref<TableDataResult>(EMPTY)
    const tableProperties = ref<TablePropertiesResult>(EMPTY_PROPERTIES)
    /** 打开表时默认视为加载中，避免首帧空工具栏/空态闪在左上角 */
    const loading = ref(Boolean(tab.tableName?.trim() && tab.connectionId))
    const cursorLoading = ref(false)
    const mutating = ref(false)
    const loadError = ref<string | null>(null)
    const changeRevision = ref(0)
    /** 已应用到服务端的 Mongo find filter（规范化后的 JSON 字符串） */
    const appliedDocumentFilter = ref<string | undefined>(undefined)
    const documentFilterDraft = ref('')
    const documentFilterError = ref<string | null>(null)
    /** Discard stale async responses when tab scope / filter changes mid-flight. */
    let loadGeneration = 0
    let propertiesGeneration = 0
    let loadMoreGeneration = 0

    function releaseActiveCursor() {
        const cursorId = tableData.value.cursorId?.trim()
        if (!cursorId) return
        releaseSqlCursorsBestEffort([cursorId], (id) => sqlApi.closeCursor(id))
    }

    const databaseName = computed(() => resolveDatabaseName(tab, explorer.tree))
    const {productionPerfActive} = useProductionPerfMode(() => tab.connectionId)
    const connectionDbType = computed(() => {
        if (!tab.connectionId) return undefined
        return explorer.findNode(tab.connectionId)?.dbType
    })
    const supportsDocumentFilter = computed(() => connectionDbType.value === 'mongodb')
    const {caps: connectionCaps, hint: capabilityHint} = useConnectionCapabilities(connectionDbType)
    const primaryKeyColumns = computed(() => resolvePrimaryKeyColumns(tableProperties.value.columns))
    const canDelete = computed(() => primaryKeyColumns.value.length > 0)
    const canUpdate = computed(() => primaryKeyColumns.value.length > 0)
    const connectionWritable = computed(() => canDmlConnection(tab.connectionId, teamStore.teams))
    const gridEditSwitchOn = computed(() => pluginStore.isSwitchEnabled('p-grid-edit'))
    const gridEditEntitled = computed(() =>
        hasDevProductivityAccess({
            mode: entitlement.mode,
            suiteId: entitlement.suiteId,
        }),
    )
    const gridEditEnabled = computed(() => gridEditSwitchOn.value && gridEditEntitled.value)
    const gridEditable = computed(
        () => gridEditEnabled.value && connectionWritable.value && connectionCaps.value.tableMutation,
    )
    const effectiveCanDelete = computed(
        () => gridEditEnabled.value && canDelete.value && connectionWritable.value && connectionCaps.value.tableMutation,
    )
    const effectiveCanUpdate = computed(
        () => gridEditEnabled.value && canUpdate.value && connectionWritable.value && connectionCaps.value.tableMutation,
    )
    const editDisabledHint = computed(() => {
        if (gridEditable.value) return undefined
        const fakeDataEnabled = pluginStore.isEnabled('p-fake-data')
        if (gridEditSwitchOn.value && !gridEditEntitled.value) {
            return t('dataGrid.gridEditProRequired')
        }
        if (
            !gridEditEnabled.value
            && fakeDataEnabled
            && connectionWritable.value
            && connectionCaps.value.tableMutation
        ) {
            return t('dataGrid.gridEditTryFakeData')
        }
        if (!gridEditEnabled.value) return t('dataGrid.gridEditPluginDisabled')
        if (!connectionWritable.value) return t('dataGrid.gridEditTeamReadonly')
        if (!connectionCaps.value.tableMutation) return capabilityHint('tableMutation')
        return undefined
    })

    function unlockGridEditPro() {
        entitlement.guardDevProductivity('dev.gridEdit')
    }

    async function loadProperties() {
        if (!tab.tableName?.trim() || !tab.connectionId) {
            tableProperties.value = EMPTY_PROPERTIES
            return
        }
        const gen = ++propertiesGeneration
        const startedAt = perfNow()
        const details = {
            connectionId: tab.connectionId,
            table: tab.tableName,
            database: databaseName.value,
        }
        try {
            const next = await tableDetailApi.fetchProperties(tab.tableName, {
                connectionId: tab.connectionId,
                database: databaseName.value,
                kind: tab.relationKind ?? 'table',
            })
            if (gen !== propertiesGeneration) return
            tableProperties.value = next
            logPerf('table.open.properties', startedAt, {
                ...details,
                columnCount: tableProperties.value.columns.length,
            })
        } catch {
            if (gen !== propertiesGeneration) return
            tableProperties.value = EMPTY_PROPERTIES
            logPerf('table.open.properties', startedAt, {...details, ok: false})
        }
    }

    async function load() {
        loadError.value = null
        if (!tab.tableName?.trim() || !tab.connectionId) {
            releaseActiveCursor()
            tableData.value = EMPTY
            loading.value = false
            return
        }

        const gen = ++loadGeneration
        loadMoreGeneration += 1
        loading.value = true
        const startedAt = perfNow()
        const details = {
            connectionId: tab.connectionId,
            table: tab.tableName,
            database: databaseName.value,
        }
        try {
            const next = await tableDataApi.fetch(tab.tableName, {
                connectionId: tab.connectionId,
                database: databaseName.value,
                maxRows: resolveSqlPageSize(productionPerfActive.value),
                filter: appliedDocumentFilter.value,
            })
            if (gen !== loadGeneration) {
                if (next.cursorId) {
                    releaseSqlCursorsBestEffort([next.cursorId], (id) => sqlApi.closeCursor(id))
                }
                return
            }
            const previousCursor = tableData.value.cursorId
            tableData.value = next
            if (previousCursor && previousCursor !== next.cursorId) {
                releaseSqlCursorsBestEffort([previousCursor], (id) => sqlApi.closeCursor(id))
            }
            logPerf('table.open.data', startedAt, {
                ...details,
                rowCount: tableData.value.rows.length,
            })
        } catch (error) {
            if (gen !== loadGeneration) return
            releaseActiveCursor()
            tableData.value = EMPTY
            loadError.value = resolveCaughtApiErrorMessage(error, t, 'workspace.metadoc.loadFailed')
            logPerf('table.open.data', startedAt, {...details, ok: false})
        } finally {
            if (gen === loadGeneration) loading.value = false
        }
    }

    async function submitChanges(batch: GridPendingBatch) {
        if (!tab.tableName?.trim() || !tab.connectionId) return false
        if (!connectionWritable.value) return false
        mutating.value = true
        try {
            // 先删后改再增，减少主键/唯一约束冲突
            for (const row of batch.deletes) {
                await tableDataApi.deleteRow(tab.tableName, {
                    connectionId: tab.connectionId,
                    database: databaseName.value,
                    values: buildRowMutateValues(row, tableData.value.columns),
                })
            }
            for (const update of batch.updates) {
                await tableDataApi.updateRow(tab.tableName, {
                    connectionId: tab.connectionId,
                    database: databaseName.value,
                    keyValues: update.keyValues,
                    values: update.values,
                })
            }
            for (const values of batch.inserts) {
                await tableDataApi.insertRow(tab.tableName, {
                    connectionId: tab.connectionId,
                    database: databaseName.value,
                    values,
                })
            }
            await load()
            changeRevision.value += 1
            return true
        } catch (error) {
            // postJson already toasts ApiError; surface unexpected failures locally.
            if (!(error instanceof ApiError)) {
                useLayoutStore().showErrorToast(
                    resolveCaughtApiErrorMessage(error, t, 'workspace.metadoc.loadFailed'),
                )
            }
            return false
        } finally {
            mutating.value = false
        }
    }

    watch(
        () =>
            [tab.tableName, tab.connectionId, tab.instanceId, tab.database, databaseName.value, explorer.treeReady] as const,
        () => {
            appliedDocumentFilter.value = undefined
            documentFilterDraft.value = ''
            documentFilterError.value = null
            void loadProperties()
            void load()
        },
        {immediate: true, deep: true},
    )

    function applyDocumentFilter() {
        if (!supportsDocumentFilter.value) return
        const normalized = normalizeMongoDocumentFilter(documentFilterDraft.value)
        if (normalized.error === 'invalidJson') {
            documentFilterError.value = t('dataGrid.documentFilter.invalidJson')
            return
        }
        if (normalized.error === 'notObject') {
            documentFilterError.value = t('dataGrid.documentFilter.notObject')
            return
        }
        documentFilterError.value = null
        appliedDocumentFilter.value = normalized.filter
        if (normalized.filter) {
            documentFilterDraft.value = normalized.filter
        }
        void load()
    }

    function clearDocumentFilter() {
        documentFilterDraft.value = ''
        documentFilterError.value = null
        if (!appliedDocumentFilter.value) return
        appliedDocumentFilter.value = undefined
        void load()
    }

    watch(
        () => workspace.tableDataRefreshSeq[tab.id],
        (next, prev) => {
            if (next == null || next === prev) return
            void load()
            changeRevision.value += 1
        },
    )

    async function loadMore() {
        const cursorId = tableData.value.cursorId
        if (!tab.tableName?.trim() || !tab.connectionId || !cursorId || cursorLoading.value) return
        const gen = ++loadMoreGeneration
        cursorLoading.value = true
        try {
            const page = await tableDataApi.fetch(tab.tableName, {
                connectionId: tab.connectionId,
                database: databaseName.value,
                cursorId,
                filter: appliedDocumentFilter.value,
            })
            if (gen !== loadMoreGeneration) {
                if (page.cursorId && page.cursorId !== cursorId) {
                    releaseSqlCursorsBestEffort([page.cursorId], (id) => sqlApi.closeCursor(id))
                }
                return
            }
            const clientMax = resolveClientMaxResultRows(productionPerfActive.value)
            const maxRows = resolveCursorLoadedRowsMax(productionPerfActive.value)
            if (clientMax > 0) {
                const remaining = Math.max(0, maxRows - tableData.value.rows.length)
                const pageRows = remaining < page.rows.length ? page.rows.slice(0, remaining) : page.rows
                const merged = [...tableData.value.rows, ...pageRows]
                const atCap = merged.length >= maxRows
                const previousCursor = tableData.value.cursorId
                const nextCursor = atCap ? undefined : page.cursorId
                tableData.value = {
                    ...tableData.value,
                    rows: merged,
                    cursorId: nextCursor,
                    hasMore: atCap ? false : page.hasMore,
                    pageOffset: page.pageOffset,
                    pageSize: page.pageSize,
                }
                if (previousCursor && previousCursor !== nextCursor) {
                    releaseSqlCursorsBestEffort([previousCursor], (id) => sqlApi.closeCursor(id))
                }
                return
            }
            const windowed = appendCursorRowsWithWindow(tableData.value.rows, page.rows, {
                previousTrimmed: tableData.value.cursorTrimmedRows ?? 0,
                maxRows,
            })
            tableData.value = {
                ...tableData.value,
                rows: windowed.rows,
                cursorId: page.cursorId,
                hasMore: page.hasMore,
                pageOffset: page.pageOffset,
                pageSize: page.pageSize,
                cursorTrimmedRows: windowed.trimmedTotal,
            }
        } finally {
            if (gen === loadMoreGeneration) cursorLoading.value = false
        }
    }

    const tableHasMore = computed(() => Boolean(tableData.value.hasMore && tableData.value.cursorId))

    const viewOptions = computed(() => resolveTableViewOptions(tab.tableName))

    onUnmounted(() => {
        releaseActiveCursor()
    })

    return {
        tableData,
        tableProperties,
        viewOptions,
        tableHasMore,
        cursorLoading,
        productionPerfActive,
        loadMore,
        loading,
        mutating,
        loadError,
        canDelete,
        canUpdate,
        connectionWritable,
        gridEditable,
        effectiveCanDelete,
        effectiveCanUpdate,
        editDisabledHint,
        unlockGridEditPro,
        primaryKeyColumns,
        submitChanges,
        refresh: load,
        databaseName,
        changeRevision,
        supportsDocumentFilter,
        documentFilterDraft,
        documentFilterError,
        appliedDocumentFilter,
        applyDocumentFilter,
        clearDocumentFilter,
    }
}
