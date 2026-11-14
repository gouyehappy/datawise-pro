import {computed, type Ref} from 'vue'
import type {ComposerTranslation} from 'vue-i18n'
import type {TableColumn, ContextMenuItem} from '@/core/types'
import type {GridDisplayRow} from '../edit/useGridPendingEdit'
import {formatCellFullValue} from '@/core/utils/cell-value-format'
import {readGridCellValue} from '@/core/data-grid/services/grid-cell-context.service'

export interface DataGridCellMenuFlags {
    editable: boolean
    canUpdate: boolean
    showExport: boolean
    showDmlActions: boolean
    showFakeData: boolean
    showAiSummary: boolean
    aiSummaryLoading: boolean
}

export interface DataGridCellContextMenuDeps {
    t: ComposerTranslation
    /** 只取菜单需要的开关；用 getter 保持与 props 的响应性 */
    flags: () => DataGridCellMenuFlags
    /** 单元格右键锚点（由调用方持有，模板也要用） */
    target: Ref<{ item: GridDisplayRow; column: TableColumn } | null>
    openMenu: (event: MouseEvent, target: { item: GridDisplayRow; column: TableColumn }) => void
    closeMenu: () => void
    activeCell: Ref<{ rowId: string; column: string } | null>
    deleteEnabled: Ref<boolean>
    exportEnabled: Ref<boolean>
    displayColumns: Ref<TableColumn[]>
    pagedRows: Ref<GridDisplayRow[]>
    getCellDisplayText: (item: GridDisplayRow, columnName: string) => string
    setCellValue: (item: GridDisplayRow, columnName: string, value: string) => void
    selectRow: (item: GridDisplayRow) => void
    showSuccessToast: (message: string) => void
    onAddRowClick: () => unknown
    onDeleteRowClick: () => unknown
    onGenerateDmlClick: () => void
    openExportDialog: () => void
    emitGenerateFakeData: () => void
    emitRequestAiSummary: () => void
}

/**
 * 结果网格的单元格右键菜单：菜单项装配 + 动作分发。
 * 抽离自 `DataGrid.vue`，行为不变。
 */
export function useDataGridCellContextMenu(deps: DataGridCellContextMenuDeps) {
    const {
        t,
        flags,
        target,
        openMenu,
        closeMenu,
        activeCell,
        deleteEnabled,
        exportEnabled,
        displayColumns,
        pagedRows,
        getCellDisplayText,
        setCellValue,
        selectRow,
        showSuccessToast,
        onAddRowClick,
        onDeleteRowClick,
        onGenerateDmlClick,
        openExportDialog,
        emitGenerateFakeData,
        emitRequestAiSummary,
    } = deps

    const cellMenuItems = computed<ContextMenuItem[]>(() => {
        const f = flags()
        const items: ContextMenuItem[] = [
            {id: 'copy-cell', label: t('dataGrid.contextMenu.copyCell'), icon: 'copy'},
            {id: 'copy-row', label: t('dataGrid.contextMenu.copyRow'), icon: 'copy'},
        ]

        // 与工具栏一致：按 editable 显示，不依赖 columnDetails 是否已加载
        if (f.editable) {
            items.push(
                {id: 'divider-edit', label: '', divider: true},
            )
            if (f.canUpdate) {
                items.push({id: 'fill-down', label: t('dataGrid.contextMenu.fillDown')})
            }
            items.push(
                {id: 'add-row', label: t('dataGrid.addRow'), icon: 'plus'},
                {
                    id: 'delete-row',
                    label: t('dataGrid.deleteRow'),
                    icon: 'minus',
                    disabled: !deleteEnabled.value,
                    danger: true,
                },
            )
        }

        const hasDataActions =
            (exportEnabled.value && f.showExport && displayColumns.value.length > 0)
            || f.showDmlActions
        if (hasDataActions) {
            items.push({id: 'divider-data', label: '', divider: true})
            if (f.showDmlActions) {
                items.push({id: 'generate-dml', label: t('dataGrid.generateDml'), icon: 'ddl'})
            }
            if (exportEnabled.value && f.showExport && displayColumns.value.length > 0) {
                items.push({id: 'export', label: t('dataGrid.export'), icon: 'export'})
            }
        }

        if (f.showFakeData || f.showAiSummary) {
            items.push({id: 'divider-extra', label: '', divider: true})
            if (f.showFakeData) {
                items.push({id: 'fake-data', label: t('workspace.fakeData.toolbar'), icon: 'dices'})
            }
            if (f.showAiSummary) {
                items.push({
                    id: 'ai-summary',
                    label: f.aiSummaryLoading
                        ? t('queryResult.aiSummaryLoading')
                        : t('queryResult.aiSummary'),
                    icon: 'bot',
                    disabled: f.aiSummaryLoading,
                })
            }
        }

        return items
    })

    function onCellContextMenu(event: MouseEvent, item: GridDisplayRow, column: TableColumn) {
        event.preventDefault()
        if (flags().editable) {
            selectRow(item)
            activeCell.value = {rowId: item.id, column: column.name}
        }
        openMenu(event, {item, column})
    }

    async function copyContextText(
        text: string,
        toastKey: 'copied' | 'statsCopied',
    ) {
        if (!text.trim()) return
        await navigator.clipboard.writeText(text)
        void toastKey
        // 复制成功不弹 toast，避免表格操作刷屏。
    }

    async function onCellMenuSelect(id: string) {
        const current = target.value
        closeMenu()
        if (!current) return
        const {item, column} = current
        const cellValue = item.originalRow ? readGridCellValue(item.originalRow, column) : null

        if (id === 'fill-down') {
            if (!flags().canUpdate) return
            const startIdx = pagedRows.value.findIndex((row) => row.id === item.id)
            if (startIdx < 0) return
            // Draft 约定：null 展示为空串，与 setCellValue / formatCellDraft 一致
            const text = getCellDisplayText(item, column.name)
            for (let i = startIdx + 1; i < pagedRows.value.length; i++) {
                const row = pagedRows.value[i]
                if (!row || row.pendingDelete) continue
                setCellValue(row, column.name, text)
            }
            return
        }
        if (id === 'copy-cell') {
            await copyContextText(formatCellFullValue(cellValue), 'copied')
            return
        }
        if (id === 'copy-row') {
            const text = displayColumns.value
                .map((col) => getCellDisplayText(item, col.name))
                .join('\t')
            await copyContextText(text, 'copied')
            return
        }
        if (id === 'add-row') {
            await onAddRowClick()
            return
        }
        if (id === 'delete-row') {
            onDeleteRowClick()
            return
        }
        if (id === 'generate-dml') {
            onGenerateDmlClick()
            return
        }
        if (id === 'export') {
            openExportDialog()
            return
        }
        if (id === 'fake-data') {
            emitGenerateFakeData()
            return
        }
        if (id === 'ai-summary') {
            emitRequestAiSummary()
        }
    }

    return {
        cellMenuItems,
        onCellContextMenu,
        copyContextText,
        onCellMenuSelect,
    }
}
