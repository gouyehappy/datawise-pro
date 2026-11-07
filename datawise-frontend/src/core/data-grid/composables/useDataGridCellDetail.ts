import {ref, type Ref} from 'vue'
import type {ComposerTranslation} from 'vue-i18n'
import type {TableColumn} from '@/core/types'
import type {TableColumnDetail} from '@/shared/api/types'
import {formatCellFullValue} from '@/core/utils/cell-value-format'
import type {GridDisplayRow} from '../edit/useGridPendingEdit'
import {resolveGridCellEditorKind, shouldUseDedicatedCellEditor, type GridCellEditorKind} from '@/core/data-grid/services/grid-cell-editor.service'
import {buildDocumentFromGridRow} from '@/core/data-grid/services/mongo-document-row.service'
import {formatMongoDocumentJson, resolveMongoDocumentRowLabel} from '@/core/data-grid/services/mongo-document-row.service'

export interface GridCellDetailState {
    columnName: string
    rowLabel: string
    content: string
    title?: string
    editable?: boolean
    editorKind?: GridCellEditorKind
    rowItem?: GridDisplayRow
}

export interface DataGridCellDetailDeps {
    t: ComposerTranslation
    props: {
        columnDetails: TableColumnDetail[]
        canUpdate: boolean
        enableRowDocumentView: boolean
    }
    gridColumns: Ref<TableColumn[]>
    displayRows: Ref<GridDisplayRow[]>
    rowOffset: Ref<number>
    inlineEnabled: Ref<boolean>
    readRawDisplayRowCell: (item: GridDisplayRow, column: TableColumn) => unknown
    setCellValue: (item: GridDisplayRow, columnName: string, value: string) => void
    formViewRow: Ref<GridDisplayRow | null>
    formViewRowNumber: Ref<number>
}

export function useDataGridCellDetail(deps: DataGridCellDetailDeps) {
    const {t, props, gridColumns, displayRows, rowOffset, inlineEnabled, readRawDisplayRowCell, setCellValue, formViewRow, formViewRowNumber} = deps

    const cellDetailOpen = ref(false)
    const cellDetail = ref<GridCellDetailState | null>(null)

    function openCellDetail(
        item: GridDisplayRow,
        column: TableColumn,
        rowIndex: number,
        options?: {forceViewOnly?: boolean},
    ) {
        const value = readRawDisplayRowCell(item, column)
        const editorKind = resolveGridCellEditorKind(column, props.columnDetails, value)
        const dedicated = shouldUseDedicatedCellEditor(column, props.columnDetails, value)
        const allowEdit = !options?.forceViewOnly
            && dedicated
            && inlineEnabled.value
            && props.canUpdate
            && !item.pendingDelete
            && editorKind !== 'binary'
        cellDetail.value = {
            columnName: column.name,
            rowLabel: `#${rowOffset.value + rowIndex + 1}`,
            content: formatCellFullValue(value),
            editable: allowEdit,
            editorKind,
            rowItem: item,
        }
        cellDetailOpen.value = true
    }

    function onFormViewOpenEditor(column: TableColumn) {
        const item = formViewRow.value
        if (!item) return
        const pageRelative = formViewRowNumber.value - rowOffset.value - 1
        openCellDetail(item, column, Math.max(0, pageRelative))
    }

    function onCellDetailApply(value: string) {
        const detail = cellDetail.value
        if (!detail?.rowItem) {
            closeCellDetail()
            return
        }
        setCellValue(detail.rowItem, detail.columnName, value)
        closeCellDetail()
    }

    function openRowDocument(item: GridDisplayRow, rowIndex: number) {
        if (!props.enableRowDocumentView || item.kind !== 'existing' || !item.originalRow) return
        const document = buildDocumentFromGridRow(gridColumns.value, item.originalRow)
        const absoluteRow = rowOffset.value + rowIndex + 1
        cellDetail.value = {
            columnName: t('dataGrid.documentView.title'),
            title: t('dataGrid.documentView.title'),
            rowLabel: resolveMongoDocumentRowLabel(document, absoluteRow),
            content: formatMongoDocumentJson(document),
        }
        cellDetailOpen.value = true
    }

    function closeCellDetail() {
        cellDetailOpen.value = false
        cellDetail.value = null
    }

    return {
        cellDetailOpen,
        cellDetail,
        openCellDetail,
        onFormViewOpenEditor,
        onCellDetailApply,
        openRowDocument,
        closeCellDetail,
    }
}
