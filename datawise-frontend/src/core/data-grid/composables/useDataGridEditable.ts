import {computed, nextTick, type Ref} from 'vue'
import type {ComposerTranslation} from 'vue-i18n'
import type {TableColumn} from '@/core/types'
import {formatCellPreviewValue, isExpandableCellValue} from '@/core/utils/cell-value-format'
import type {GridDisplayRow} from '../edit/useGridPendingEdit'
import type {TableColumnDetail} from '@/shared/api/types'

export interface DataGridEditableDeps {
    t: ComposerTranslation
    props: {
        editable: boolean
        canDelete: boolean
        canUpdate: boolean
        columnDetails: TableColumnDetail[]
    }
    gridColumns: Ref<TableColumn[]>
    displayRows: Ref<GridDisplayRow[]>
    pagedRows: Ref<GridDisplayRow[]>
    currentPage: Ref<number>
    totalPages: Ref<number>
    gridBodyRef: Ref<HTMLElement | null>
    useGridVirtual: Ref<boolean>
    readRawDisplayRowCell: (item: GridDisplayRow, column: TableColumn) => unknown
    getCellDisplayText: (item: GridDisplayRow, columnName: string) => string
    isCellEditing: (item: GridDisplayRow, columnName: string) => boolean
    addInsertRow: () => void
    markDeleteSelected: () => void
    submitPending: () => Promise<boolean>
    discardPending: () => void
    setCellValue: (item: GridDisplayRow, columnName: string, value: string) => void
    selectedRowId: Ref<string | null>
    hasPendingChanges: Ref<boolean>
    pendingCount: Ref<number>
    submitting: Ref<boolean>
    editingCell: Ref<{rowId: string; column: string} | null>
    cellInputRef: Ref<HTMLInputElement | null>
    scrollToRowIndex: (index: number) => void
    closeDateTimePicker: () => void
    stopEditCell: () => void
}

export function useDataGridEditable(deps: DataGridEditableDeps) {
    const {t, props, gridColumns, displayRows, pagedRows, currentPage, totalPages, gridBodyRef, useGridVirtual, readRawDisplayRowCell, getCellDisplayText, isCellEditing, addInsertRow, markDeleteSelected, submitPending, discardPending, setCellValue, selectedRowId, hasPendingChanges, pendingCount, submitting, editingCell, cellInputRef, scrollToRowIndex, closeDateTimePicker, stopEditCell} = deps

    const inlineEnabled = computed(() => props.editable && props.columnDetails.length > 0)

    const deleteEnabled = computed(
        () => props.editable && props.canDelete && selectedRowId.value != null && !submitting.value,
    )

    const submitEnabled = computed(
        () => inlineEnabled.value && hasPendingChanges.value && !submitting.value,
    )

    const discardEnabled = computed(
        () => hasPendingChanges.value && !submitting.value,
    )

    const submitActionTitle = computed(() =>
        submitEnabled.value
            ? t('dataGrid.submitChanges', {count: pendingCount.value})
            : t('dataGrid.submitChangesDisabled'),
    )

    const discardActionTitle = computed(() =>
        discardEnabled.value
            ? t('dataGrid.discardChanges')
            : t('dataGrid.discardChangesDisabled'),
    )

    const deleteActionTitle = computed(() =>
        deleteEnabled.value
            ? t('dataGrid.deleteRow')
            : t('dataGrid.deleteRowDisabled'),
    )

    const columnsByName = computed(() => {
        const map = new Map<string, TableColumn>()
        for (const col of gridColumns.value) {
            map.set(col.name, col)
        }
        return map
    })

    async function onAddRowClick() {
        addInsertRow()
        await nextTick()
        currentPage.value = totalPages.value // 新增行在列表末尾
        await nextTick()
        cellInputRef.value?.focus()
        if (useGridVirtual.value) {
            scrollToRowIndex(pagedRows.value.length - 1)
            return
        }
        gridBodyRef.value?.scrollTo({top: gridBodyRef.value.scrollHeight, behavior: 'smooth'})
    }

    function bindEditingInput(
        el: unknown,
        item: GridDisplayRow,
        columnName: string,
    ) {
        if (!(el instanceof HTMLInputElement)) return
        const editing = editingCell.value
        if (editing?.rowId === item.id && editing.column === columnName) {
            cellInputRef.value = el
        }
    }

    function isCellInputVisible(item: GridDisplayRow, columnName: string) {
        return item.kind === 'insert' || isCellEditing(item, columnName)
    }

    function cellBackingText(item: GridDisplayRow, columnName: string) {
        const column = columnsByName.value.get(columnName)
        if (!column) return ''
        if (item.kind === 'insert' || isCellInputVisible(item, columnName)) {
            const text = getCellDisplayText(item, columnName)
            if (text) return text
            if (item.kind === 'insert') return '\u00a0'
            return t('common.nullValue')
        }
        const preview = formatCellPreviewValue(readRawDisplayRowCell(item, column))
        if (preview) return preview
        return t('common.nullValue')
    }

    function canExpandCell(item: GridDisplayRow, column: TableColumn): boolean {
        return isExpandableCellValue(readRawDisplayRowCell(item, column))
    }

    function onDeleteRowClick() {
        markDeleteSelected()
    }

    async function onSubmitClick() {
        await submitPending()
    }

    function onDiscardClick() {
        discardPending()
    }

    function onCellInput(item: GridDisplayRow, columnName: string, value: string) {
        setCellValue(item, columnName, value)
    }

    function onCellKeydownEnter(event: KeyboardEvent) {
        event.preventDefault()
        closeDateTimePicker()
        stopEditCell()
    }

    return {
        inlineEnabled,
        deleteEnabled,
        submitEnabled,
        discardEnabled,
        submitActionTitle,
        discardActionTitle,
        deleteActionTitle,
        columnsByName,
        onAddRowClick,
        bindEditingInput,
        isCellInputVisible,
        cellBackingText,
        canExpandCell,
        onDeleteRowClick,
        onSubmitClick,
        onDiscardClick,
        onCellInput,
        onCellKeydownEnter,
    }
}
