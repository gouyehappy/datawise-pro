import {computed, nextTick, ref, watch, type Ref} from 'vue'
import type {TableColumn} from '@/core/types'
import type {TableColumnDetail} from '@/shared/api/types'
import type {GridDisplayRow} from '../edit/useGridPendingEdit'
import {
    isGridTemporalColumn,
    resolveGridTemporalKind,
    type GridTemporalKind,
} from '../meta/column-meta'

const DATE_PICKER_WIDTH_PX = 268
const DATE_PICKER_MAX_HEIGHT_PX = 320
const VIEWPORT_MARGIN_PX = 8

export interface DataGridDateTimePickerDeps {
    displayRows: Ref<GridDisplayRow[]>
    gridColumns: Ref<TableColumn[]>
    getCellDisplayText: (item: GridDisplayRow, columnName: string) => string
    setCellValue: (item: GridDisplayRow, columnName: string, value: string) => void
    editingCell: Ref<{ rowId: string; column: string } | null>
    startEditCell: (item: GridDisplayRow, columnName: string) => unknown
    cellInputRef: Ref<HTMLInputElement | null>
    columnDetails: () => TableColumnDetail[]
    canUpdate: () => boolean
    /** 惰性取值：inlineEnabled 由 useDataGridEditable 产出，晚于本 composable 构造 */
    inlineEnabled: () => boolean
    isCellInputVisible: (item: GridDisplayRow, columnName: string) => boolean
    isCellActive: (item: GridDisplayRow, columnName: string) => boolean
}

/**
 * 时间类型单元格的日期选择器（锚点定位 / 开合 / 回填）。
 *
 * 抽离自 `DataGrid.vue`：状态与行为保持一一对应，仅把对 `inlineEnabled` /
 * `isCellInputVisible` 的直接引用改为惰性调用，避免与 `useDataGridEditable`
 * 形成构造顺序上的循环依赖。
 */
export function useDataGridDateTimePicker(deps: DataGridDateTimePickerDeps) {
    const {
        displayRows,
        gridColumns,
        getCellDisplayText,
        setCellValue,
        editingCell,
        startEditCell,
        cellInputRef,
        columnDetails,
        canUpdate,
        inlineEnabled,
        isCellInputVisible,
        isCellActive,
    } = deps

    const datePickerTarget = ref<{ rowId: string; column: string; kind: GridTemporalKind } | null>(null)
    const datePickerStyle = ref<{ top: string; left: string } | undefined>()
    const datePickerKeepOpen = ref(false)

    const datePickerValue = computed(() => {
        const target = datePickerTarget.value
        if (!target) return ''
        const item = displayRows.value.find((row) => row.id === target.rowId)
        if (!item) return ''
        return getCellDisplayText(item, target.column)
    })

    function updateDatePickerPlacement() {
        const input = cellInputRef.value
        if (!input) return
        const rect = input.getBoundingClientRect()
        const left = Math.min(rect.left, window.innerWidth - DATE_PICKER_WIDTH_PX - VIEWPORT_MARGIN_PX)
        datePickerStyle.value = {
            top: `${Math.min(rect.bottom + 4, window.innerHeight - DATE_PICKER_MAX_HEIGHT_PX)}px`,
            left: `${Math.max(VIEWPORT_MARGIN_PX, left)}px`,
        }
    }

    function openDateTimePicker(item: GridDisplayRow, columnName: string) {
        const column = gridColumns.value.find((col) => col.name === columnName)
        if (!column) {
            datePickerTarget.value = null
            return
        }
        const kind = resolveGridTemporalKind(column, columnDetails())
        if (!kind) {
            datePickerTarget.value = null
            return
        }
        datePickerTarget.value = {rowId: item.id, column: columnName, kind}
        void nextTick(updateDatePickerPlacement)
    }

    function closeDateTimePicker() {
        datePickerTarget.value = null
        datePickerKeepOpen.value = false
    }

    function onDatePickerChange(value: string) {
        const target = datePickerTarget.value
        if (!target) return
        const item = displayRows.value.find((row) => row.id === target.rowId)
        if (!item) return
        setCellValue(item, target.column, value)
    }

    function onDatePickerPointerDown() {
        datePickerKeepOpen.value = true
    }

    function isTemporalColumn(column: TableColumn): boolean {
        return isGridTemporalColumn(column, columnDetails())
    }

    function showDateTimeIcon(item: GridDisplayRow, column: TableColumn): boolean {
        return inlineEnabled() && canUpdate() && !item.pendingDelete
            && isTemporalColumn(column)
            && (
                item.kind === 'insert'
                || isCellActive(item, column.name)
                || isCellInputVisible(item, column.name)
            )
    }

    async function onDateTimeIconClick(item: GridDisplayRow, columnName: string) {
        datePickerKeepOpen.value = true
        const openSame = datePickerTarget.value?.rowId === item.id
            && datePickerTarget.value?.column === columnName
        if (openSame) {
            closeDateTimePicker()
            return
        }
        if (!editingCell.value || editingCell.value.rowId !== item.id || editingCell.value.column !== columnName) {
            await startEditCell(item, columnName)
        }
        await nextTick()
        openDateTimePicker(item, columnName)
    }

    watch(editingCell, (cell) => {
        if (!cell) closeDateTimePicker()
    })

    return {
        datePickerTarget,
        datePickerStyle,
        datePickerKeepOpen,
        datePickerValue,
        closeDateTimePicker,
        onDatePickerChange,
        onDatePickerPointerDown,
        isTemporalColumn,
        showDateTimeIcon,
        onDateTimeIconClick,
    }
}
