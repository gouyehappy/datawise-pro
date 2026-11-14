import {computed, ref, type Ref} from 'vue'
import type {ComposerTranslation} from 'vue-i18n'
import type {TableColumn, TableRow, ContextMenuItem} from '@/core/types'
import type {GridDisplayRow} from '../edit/useGridPendingEdit'
import {
    computeGridColumnStats,
    formatGridColumnStatsLines,
    type GridColumnStats,
} from '../services/grid-column-stats.service'

const AUTO_SIZE_SAMPLE_ROWS = 80

export interface DataGridHeaderContextMenuDeps {
    t: ComposerTranslation
    /** 用 getter 保持与 props 的响应性 */
    enableSqlFill: () => boolean
    /** 表头右键锚点（由调用方持有，模板也要用） */
    target: Ref<TableColumn | null>
    openMenu: (event: MouseEvent, target: TableColumn) => void
    closeMenu: () => void
    gridColumns: Ref<TableColumn[]>
    viewFilteredDisplayRows: Ref<GridDisplayRow[]>
    pagedRows: Ref<GridDisplayRow[]>
    columnKey: (column: TableColumn) => string
    isColumnPinned: (columnKey: string) => boolean
    isColumnPinnedRight: (columnKey: string) => boolean
    autoSizeColumn: (columnKey: string, samples: string[], options: { headerText: string }) => void
    togglePinned: (columnKey: string, side: 'left' | 'right') => void
    setColumnHidden: (columnKey: string, hidden: boolean) => void
    openColumnPanel: () => void
    getCellDisplayText: (item: GridDisplayRow, columnName: string) => string
    copyContextText: (text: string, toastKey: 'copied' | 'statsCopied') => Promise<void>
    emitInsertOrderBy: (payload: { column: string; direction: 'asc' | 'desc' }) => void
    emitRewriteOrderBy: (payload: { column: string; direction: 'asc' | 'desc' }) => void
}

/**
 * 表头右键菜单 + 列统计浮层状态。
 * 抽离自 `DataGrid.vue`，行为不变。
 */
export function useDataGridHeaderContextMenu(deps: DataGridHeaderContextMenuDeps) {
    const {
        t,
        enableSqlFill,
        target,
        openMenu,
        closeMenu,
        gridColumns,
        viewFilteredDisplayRows,
        pagedRows,
        columnKey,
        isColumnPinned,
        isColumnPinnedRight,
        autoSizeColumn,
        togglePinned,
        setColumnHidden,
        openColumnPanel,
        getCellDisplayText,
        copyContextText,
        emitInsertOrderBy,
        emitRewriteOrderBy,
    } = deps

    const statsColumnName = ref<string | null>(null)

    const headerMenuItems = computed<ContextMenuItem[]>(() => {
        const column = target.value
        const key = column ? columnKey(column) : ''
        const pinned = key ? isColumnPinned(key) : false
        const pinnedRight = key ? isColumnPinnedRight(key) : false
        const items: ContextMenuItem[] = [
            {id: 'toggle-column-stats', label: t('dataGrid.contextMenu.toggleColumnStats')},
            {id: 'copy-column-stats', label: t('dataGrid.contextMenu.copyColumnStats')},
            {id: 'divider-layout', label: '', divider: true},
            {id: 'auto-size-column', label: t('dataGrid.contextMenu.autoSizeColumn')},
            {
                id: 'toggle-pin-column',
                label: pinned
                    ? t('dataGrid.contextMenu.unpinColumn')
                    : t('dataGrid.contextMenu.pinColumn'),
            },
            {
                id: 'toggle-pin-column-right',
                label: pinnedRight
                    ? t('dataGrid.contextMenu.unpinColumn')
                    : t('dataGrid.contextMenu.pinColumnRight'),
            },
            {id: 'hide-column', label: t('dataGrid.contextMenu.hideColumn')},
            {id: 'manage-columns', label: t('dataGrid.contextMenu.manageColumns')},
        ]
        if (enableSqlFill()) {
            items.push(
                {id: 'divider-sql-fill', label: '', divider: true},
                {id: 'insert-order-by', label: t('dataGrid.contextMenu.insertOrderBy')},
                {id: 'insert-order-by-desc', label: t('dataGrid.contextMenu.insertOrderByDesc')},
                {id: 'rewrite-order-by', label: t('dataGrid.contextMenu.rewriteOrderBy')},
                {id: 'rewrite-order-by-desc', label: t('dataGrid.contextMenu.rewriteOrderByDesc')},
            )
        }
        return items
    })

    function resolveStatsRows(): TableRow[] {
        return viewFilteredDisplayRows.value
            .filter((row) => row.kind !== 'insert' && row.originalRow)
            .map((row) => row.originalRow!)
    }

    const activeColumnStats = computed<GridColumnStats | null>(() => {
        const name = statsColumnName.value
        if (!name) return null
        const column = gridColumns.value.find((entry) => entry.name === name)
        if (!column) return null
        return computeGridColumnStats(column, resolveStatsRows())
    })

    function onHeaderContextMenu(event: MouseEvent, column: TableColumn) {
        event.preventDefault()
        openMenu(event, column)
    }

    async function onHeaderMenuSelect(id: string) {
        const column = target.value
        closeMenu()
        if (!column) return

        if (id === 'toggle-column-stats') {
            statsColumnName.value = statsColumnName.value === column.name ? null : column.name
            return
        }

        if (id === 'auto-size-column') {
            const samples = pagedRows.value
                .slice(0, AUTO_SIZE_SAMPLE_ROWS)
                .map((row) => getCellDisplayText(row, column.name))
            autoSizeColumn(columnKey(column), samples, {headerText: column.name})
            return
        }
        if (id === 'toggle-pin-column') {
            togglePinned(columnKey(column), 'left')
            return
        }
        if (id === 'toggle-pin-column-right') {
            togglePinned(columnKey(column), 'right')
            return
        }
        if (id === 'hide-column') {
            setColumnHidden(columnKey(column), true)
            return
        }
        if (id === 'manage-columns') {
            openColumnPanel()
            return
        }

        if (id === 'copy-column-stats') {
            const stats = computeGridColumnStats(column, resolveStatsRows())
            await copyContextText(formatGridColumnStatsLines(stats).join('\n'), 'statsCopied')
            return
        }
        if (id === 'insert-order-by') {
            emitInsertOrderBy({column: column.name, direction: 'asc'})
            return
        }
        if (id === 'insert-order-by-desc') {
            emitInsertOrderBy({column: column.name, direction: 'desc'})
            return
        }
        if (id === 'rewrite-order-by') {
            emitRewriteOrderBy({column: column.name, direction: 'asc'})
            return
        }
        if (id === 'rewrite-order-by-desc') {
            emitRewriteOrderBy({column: column.name, direction: 'desc'})
        }
    }

    function dismissColumnStats() {
        statsColumnName.value = null
    }

    return {
        statsColumnName,
        headerMenuItems,
        activeColumnStats,
        onHeaderContextMenu,
        onHeaderMenuSelect,
        dismissColumnStats,
    }
}
