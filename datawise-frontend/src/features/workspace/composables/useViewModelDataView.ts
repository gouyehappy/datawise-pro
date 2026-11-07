import {computed, onUnmounted, ref} from 'vue'
import type {WorkspaceTab} from '@/core/types'
import {sqlApi} from '@/api/modules/sql'
import type {TableColumn, TableRow} from '@/core/types'
import {resolveSqlPageSize, resolveCursorLoadedRowsMax} from '@/features/settings/services/query-limit.service'
import {appendCursorRowsWithWindow} from '@/features/workspace/services/query-result-cursor.service'
import {releaseSqlCursorsBestEffort} from '@/features/workspace/services/sql-cursor-release.service'
import {useProductionPerfMode} from '@/features/settings/composables/useProductionPerfMode'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {t} from '@/i18n'

/** 视图模型数据 Tab：游标分页，与 SQL 控制台/表数据共用 maxResultRows 作为每批行数 */
export function useViewModelDataView(tab: WorkspaceTab) {
    const columns = ref<TableColumn[]>([])
    const rows = ref<TableRow[]>([])
    const loading = ref(false)
    const cursorLoading = ref(false)
    const cursorId = ref<string | null>(null)
    const pageSize = ref(resolveSqlPageSize())
    const hasMore = ref(false)
    const cursorTrimmedRows = ref(0)
    const errorMessage = ref<string | null>(null)
    const {productionPerfActive} = useProductionPerfMode(() => tab.connectionId)

    const sql = computed(() => tab.viewModelSql?.trim() ?? '')

    function releaseActiveCursor() {
        const id = cursorId.value?.trim()
        if (!id) return
        releaseSqlCursorsBestEffort([id], (cursor) => sqlApi.closeCursor(cursor))
        cursorId.value = null
    }

    async function executeQuery(append = false) {
        if (!tab.connectionId || !sql.value) return
        const isAppend = append && cursorId.value
        if (isAppend) {
            cursorLoading.value = true
        } else {
            loading.value = true
            const previous = cursorId.value
            cursorId.value = null
            hasMore.value = false
            cursorTrimmedRows.value = 0
            pageSize.value = resolveSqlPageSize(productionPerfActive.value)
            if (previous) {
                releaseSqlCursorsBestEffort([previous], (cursor) => sqlApi.closeCursor(cursor))
            }
        }
        errorMessage.value = null
        try {
            const result = isAppend
                ? await sqlApi.fetchCursorPage(cursorId.value!, pageSize.value)
                : await sqlApi.execute(sql.value, {
                    connectionId: tab.connectionId,
                    database: tab.database ?? tab.instanceId ?? undefined,
                    pageSize: pageSize.value,
                })
            const nextColumns = (result.columns ?? []) as TableColumn[]
            const nextRows = (result.rows ?? []) as TableRow[]
            if (isAppend) {
                const windowed = appendCursorRowsWithWindow(rows.value, nextRows, {
                    previousTrimmed: cursorTrimmedRows.value,
                    maxRows: resolveCursorLoadedRowsMax(productionPerfActive.value),
                })
                rows.value = windowed.rows
                cursorTrimmedRows.value = windowed.trimmedTotal
            } else {
                columns.value = nextColumns
                rows.value = nextRows
            }
            cursorId.value = result.cursorId ?? null
            hasMore.value = Boolean(result.cursorId)
        } catch (error) {
            errorMessage.value = resolveCaughtApiErrorMessage(error, t, 'viewModel.loadFailed')
            if (!isAppend) {
                columns.value = []
                rows.value = []
                releaseActiveCursor()
            }
        } finally {
            loading.value = false
            cursorLoading.value = false
        }
    }

    async function refresh() {
        await executeQuery(false)
    }

    async function loadMore() {
        if (!hasMore.value || cursorLoading.value) return
        await executeQuery(true)
    }

    onUnmounted(() => {
        releaseActiveCursor()
    })

    return {
        columns,
        rows,
        loading,
        cursorLoading,
        hasMore,
        cursorTrimmedRows,
        productionPerfActive,
        errorMessage,
        sql,
        refresh,
        loadMore,
        executeQuery,
    }
}
