/**
 * 表数据网格的「本地暂存编辑」模型。
 *
 * 交互约定（类似 Navicat）：
 * - 新增/修改/删除先记在内存，点保存才调 API
 * - 待删除行保留在列表中，仅标红（pendingDelete）
 * - 双击才开始编辑；新增行各列直接显示输入框
 */
import { computed, nextTick, ref, watch } from 'vue'
import type {TableColumn, TableColumnDetail, TableRow} from '../grid-types'
import {readRowCell, readRowCellScalar} from '../utils/query-result-column'
import {formatCellFullValue} from '../utils/cell-value-format'
import {
    createEmptyInsertDraft,
    insertDraftHasValues,
    parseInsertDraftValues,
    rowKey,
} from '../services/table-row-mutate.service'

export type GridPendingBatch = {
  /** 点保存时按顺序提交：deletes → updates → inserts（见 useTableDataView） */
  inserts: Array<Record<string, string | number | boolean | null>>
    updates: Array<{
        originalRow: TableRow
        keyValues: Record<string, string | number | boolean | null>
        values: Record<string, string | number | boolean | null>
    }>
    deletes: TableRow[]
}

export type GridDisplayRow = {
    id: string
    kind: 'existing' | 'insert'
    pendingDelete?: boolean
    originalRow?: TableRow
}

export function formatCellDraft(value: unknown): string {
    return formatCellFullValue(value)
}

export function rowDraftFromRow(row: TableRow, columns: TableColumn[]): Record<string, string> {
    const draft: Record<string, string> = {}
    for (const col of columns) {
        draft[col.name] = formatCellDraft(readRowCell(row, col))
    }
    return draft
}

export function buildPrimaryKeyValues(
    row: TableRow,
    columns: TableColumn[],
    pkColumns: string[],
): Record<string, string | number | boolean | null> {
    const values: Record<string, string | number | boolean | null> = {}
    for (const name of pkColumns) {
        const col =
            columns.find((item) => item.name === name)
            ?? columns.find((item) => item.name.toLowerCase() === name.toLowerCase())
        if (!col) continue
        values[name] = readRowCellScalar(row, col)
    }
    return values
}

export function buildUpdatePayload(
  originalRow: TableRow,
  draft: Record<string, string>,
  columns: TableColumn[],
  columnDetails: TableColumnDetail[],
  pkColumns: string[],
) {
  const parsed = parseInsertDraftValues(draft, columnDetails)
  const keyValues = buildPrimaryKeyValues(originalRow, columns, pkColumns)
  const values: Record<string, string | number | boolean | null> = {}

  // 只提交相对原行有变化的列，减轻 UPDATE 语句体积
  for (const col of columns) {
        const original = readRowCellScalar(originalRow, col)
        const next = Object.prototype.hasOwnProperty.call(parsed, col.name)
            ? parsed[col.name]
            : original
        if (!cellValuesEqual(original, next)) {
            values[col.name] = next ?? null
        }
    }

    return {keyValues, values}
}

export function cellValuesEqual(
    left: string | number | boolean | null | undefined,
    right: string | number | boolean | null | undefined,
): boolean {
    if (left == null && right == null) return true
    if (left == null || right == null) return false
    return String(left) === String(right)
}

export function isAutoIncrementColumn(
    columnName: string,
    columnDetails: TableColumnDetail[] | undefined,
): boolean {
    return columnDetails?.find((col) => col.name === columnName)?.autoIncrement ?? false
}

let insertCounter = 0

export function useGridPendingEdit(options: {
    columns: () => TableColumn[]
    rows: () => TableRow[]
    columnDetails: () => TableColumnDetail[]
    editable: () => boolean
    pkColumns: () => string[]
    tableAutoIncrement: () => string | null | undefined
    onSubmit: (batch: GridPendingBatch) => Promise<boolean>
}) {
  // --- 本地暂存三类变更 ---
  const pendingUpdates = ref<Record<string, Record<string, string>>>({})
  const pendingDeletes = ref<Set<string>>(new Set())
  const pendingInserts = ref<Array<{ id: string; draft: Record<string, string> }>>([])
    const selectedRowId = ref<string | null>(null)
    const editingCell = ref<{ rowId: string; column: string } | null>(null)
    const submitting = ref(false)
    const cellInputRef = ref<HTMLInputElement | null>(null)

    function resetPending() {
        pendingUpdates.value = {}
        pendingDeletes.value = new Set()
        pendingInserts.value = []
        selectedRowId.value = null
        editingCell.value = null
    }

  watch(
    () => options.rows(),
    () => resetPending(), // 服务端重新加载后丢弃本地草稿，避免与旧数据合并
  )

    const originalRowByKey = computed(() => {
        const map = new Map<string, TableRow>()
        const pkColumns = options.pkColumns()
        for (const [index, row] of options.rows().entries()) {
            map.set(
                rowKey(row, options.columns(), {index, pkColumns}),
                row,
            )
        }
        return map
    })

  /** Reuse wrappers across appends when the same row object + delete flag are unchanged. */
  const displayRowCache = new WeakMap<TableRow, GridDisplayRow>()

  const displayRows = computed<GridDisplayRow[]>(() => {
    const items: GridDisplayRow[] = []
    const pkColumns = options.pkColumns()
    const deletes = pendingDeletes.value
    // 已有行：待删除也继续展示，靠 pendingDelete 标红而非从列表移除
    for (const [index, row] of options.rows().entries()) {
            const key = rowKey(row, options.columns(), {index, pkColumns})
            const pendingDelete = deletes.has(key)
            let wrapper = displayRowCache.get(row)
            if (!wrapper || wrapper.id !== key || Boolean(wrapper.pendingDelete) !== pendingDelete) {
                wrapper = {
                    id: key,
                    kind: 'existing',
                    originalRow: row,
                    pendingDelete,
                }
                displayRowCache.set(row, wrapper)
            }
            items.push(wrapper)
        }
        for (const insert of pendingInserts.value) {
            items.push({id: insert.id, kind: 'insert'})
        }
        return items
    })

    const hasPendingChanges = computed(() =>
        pendingInserts.value.length > 0
        || pendingDeletes.value.size > 0
        || Object.keys(pendingUpdates.value).length > 0,
    )

    const pendingCount = computed(() =>
        pendingInserts.value.length
        + pendingDeletes.value.size
        + Object.keys(pendingUpdates.value).length,
    )

    function getDraftForRow(item: GridDisplayRow): Record<string, string> {
        if (item.kind === 'insert') {
            const insert = pendingInserts.value.find((row) => row.id === item.id)
            return insert?.draft ?? {}
        }
        const key = item.id
        if (pendingUpdates.value[key]) return pendingUpdates.value[key]
        const original = item.originalRow ?? originalRowByKey.value.get(key)
        return original ? rowDraftFromRow(original, options.columns()) : {}
    }

    function getCellDisplayText(item: GridDisplayRow, columnName: string): string {
        const draft = getDraftForRow(item)
        const text = draft[columnName] ?? ''
        return text
    }

    function rowDraftDiffersFromOriginal(draft: Record<string, string>, original: TableRow): boolean {
        for (const col of options.columns()) {
            const orig = formatCellDraft(readRowCell(original, col))
            const next = draft[col.name] ?? orig
            if (!cellValuesEqual(orig, next)) return true
        }
        return false
    }

    function isRowModified(item: GridDisplayRow): boolean {
        if (item.pendingDelete) return false
        if (item.kind === 'insert') return true
        const draft = pendingUpdates.value[item.id]
        if (!draft) return false
        const original = item.originalRow ?? originalRowByKey.value.get(item.id)
        return original ? rowDraftDiffersFromOriginal(draft, original) : false
    }

    function isRowPendingDelete(item: GridDisplayRow): boolean {
        return item.pendingDelete === true
    }

    function isRowSelected(item: GridDisplayRow) {
        return selectedRowId.value === item.id
    }

    function selectRow(item: GridDisplayRow) {
        // 允许只读模式下选中（表单视图翻行等）；写入类操作另有 editable 门禁
        selectedRowId.value = item.id
    }

    function ensureDraft(item: GridDisplayRow): Record<string, string> {
        const draft = {...getDraftForRow(item)}
        if (item.kind === 'insert') {
            pendingInserts.value = pendingInserts.value.map((row) =>
                row.id === item.id ? {...row, draft} : row,
            )
            return draft
        }
        pendingUpdates.value = {
            ...pendingUpdates.value,
            [item.id]: draft,
        }
        return draft
    }

    function setCellValue(item: GridDisplayRow, columnName: string, value: string) {
        const draft = ensureDraft(item)
        draft[columnName] = value
        if (item.kind === 'insert') {
            pendingInserts.value = pendingInserts.value.map((row) =>
                row.id === item.id ? {...row, draft: {...draft}} : row,
            )
            return
        }
    const original = item.originalRow ?? originalRowByKey.value.get(item.id)
    // 值改回原样时移出 pendingUpdates，避免仅双击未改值就标黄
    if (original && !rowDraftDiffersFromOriginal(draft, original)) {
            const nextUpdates = {...pendingUpdates.value}
            delete nextUpdates[item.id]
            pendingUpdates.value = nextUpdates
            return
        }
        pendingUpdates.value = {
            ...pendingUpdates.value,
            [item.id]: {...draft},
        }
    }

  async function startEditCell(item: GridDisplayRow, columnName: string) {
    if (!options.editable()) return
    if (item.pendingDelete) return
    // 已有行的自增列不可改；新增行可填预计 id
    if (item.kind !== 'insert' && isAutoIncrementColumn(columnName, options.columnDetails())) return
    editingCell.value = {rowId: item.id, column: columnName}
    await nextTick()
    const input = cellInputRef.value
    if (!input) return
    input.focus({preventScroll: true})
    input.select()
  }

    function stopEditCell() {
        editingCell.value = null
    }

    function isCellEditing(item: GridDisplayRow, columnName: string) {
        const cell = editingCell.value
        return cell?.rowId === item.id && cell.column === columnName
    }

    function addInsertRow() {
        const id = `insert-${++insertCounter}`
        const columns = options.columns()
        const firstColumn = columns[0]?.name ?? null
        pendingInserts.value = [
            ...pendingInserts.value,
            {
                id,
                draft: createEmptyInsertDraft(options.columnDetails(), {
                    tableAutoIncrement: options.tableAutoIncrement(),
                    rows: options.rows(),
                    gridColumns: columns,
                    pendingInsertOffset: pendingInserts.value.length,
                }),
            },
        ]
        selectedRowId.value = id
        if (firstColumn) {
            editingCell.value = {rowId: id, column: firstColumn}
        }
    }

    function markDeleteSelected() {
        const id = selectedRowId.value
        if (!id) return
        const item = displayRows.value.find((row) => row.id === id)
        if (!item) return
        if (item.kind === 'insert') {
            pendingInserts.value = pendingInserts.value.filter((row) => row.id !== id)
        } else if (item.pendingDelete) {
            // 对已标红行再点删除 → 撤销本地删除标记
            const nextDeletes = new Set(pendingDeletes.value)
            nextDeletes.delete(item.id)
            pendingDeletes.value = nextDeletes
        } else {
            const nextDeletes = new Set(pendingDeletes.value)
            nextDeletes.add(item.id)
            pendingDeletes.value = nextDeletes
            // 删除与修改互斥：标删后丢弃该行未提交的修改
            const nextUpdates = { ...pendingUpdates.value }
            delete nextUpdates[item.id]
            pendingUpdates.value = nextUpdates
        }
        selectedRowId.value = null
        stopEditCell()
    }

    /** 将三类本地草稿序列化为 API 批次；空批次返回 null */
    function buildSubmitBatch(): GridPendingBatch | null {
        const details = options.columnDetails()
        const columns = options.columns()
        const pkColumns = options.pkColumns()
        if (!details.length) return null

        const inserts = pendingInserts.value
            .map((row) => parseInsertDraftValues(row.draft, details))
            .filter((values) => Object.keys(values).length > 0)

        const updates = Object.entries(pendingUpdates.value)
            .map(([key, draft]) => {
                const originalRow = originalRowByKey.value.get(key)
                if (!originalRow) return null
                const payload = buildUpdatePayload(originalRow, draft, columns, details, pkColumns)
                if (Object.keys(payload.values).length === 0) return null
                return {originalRow, ...payload}
            })
            .filter((item): item is NonNullable<typeof item> => item != null)

        const deletes = [...pendingDeletes.value]
            .map((key) => originalRowByKey.value.get(key))
            .filter((row): row is TableRow => row != null)

        if (inserts.length === 0 && updates.length === 0 && deletes.length === 0) {
            return null
        }

        return {inserts, updates, deletes}
    }

    async function submitPending() {
        const batch = buildSubmitBatch()
        if (!batch) return false
        submitting.value = true
        try {
            const ok = await options.onSubmit(batch)
            if (ok) resetPending()
            return ok
        } finally {
            submitting.value = false
        }
    }

    function discardPending() {
        resetPending()
    }

    return {
        displayRows,
        hasPendingChanges,
        pendingCount,
        selectedRowId,
        editingCell,
        submitting,
        cellInputRef,
        selectRow,
        isRowSelected,
        isRowModified,
        isRowPendingDelete,
        getCellDisplayText,
        isCellEditing,
        startEditCell,
        stopEditCell,
        setCellValue,
        addInsertRow,
        markDeleteSelected,
        submitPending,
        discardPending,
        resetPending,
        insertDraftHasValues,
    }
}
