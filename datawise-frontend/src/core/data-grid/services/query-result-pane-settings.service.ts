export type ResultPaneSortOrder = 'oldest' | 'newest'
export type ResultPaneLayout = 'grid' | 'form'
export type ResultPaneColumnDensity = 'compact' | 'standard' | 'relaxed'
export type ResultPaneNumericAlign = 'left' | 'right'

export const TABLE_FONT_SIZE_MIN = 8
export const TABLE_FONT_SIZE_MAX = 16
export const TABLE_FONT_SIZE_DEFAULT = 13

export interface QueryResultPaneSettings {
    /** Tab / 输出日志排序：最早优先 | 最新优先 */
    sortOrder: ResultPaneSortOrder
    /** 新查询时保留已有结果 Tab */
    keepExistingResults: boolean
    /** 表头显示字段类型 */
    showFieldTypes: boolean
    /** 表头显示字段注释 */
    showFieldComments: boolean
    /** 单元格自动换行 */
    wrapCells: boolean
    /** 结果布局：表格 | 表单 */
    resultLayout: ResultPaneLayout
    /** 列宽疏密 */
    columnDensity: ResultPaneColumnDensity
    /** 数值列对齐 */
    numericAlign: ResultPaneNumericAlign
    /** 隐藏整列均为 NULL 的列 */
    hideNullColumns: boolean
    /** 隐藏整列均为 NULL 或空字符串的列 */
    hideEmptyColumns: boolean
    /** 按数据类型着色单元格 */
    typeColoring: boolean
    /** 全局冻结首列（渲染层；不写入单表 pin 状态） */
    freezeFirstColumn: boolean
    /** 工具栏仅显示图标 */
    hideToolbarLabels: boolean
    /** CSV 导出不写 UTF-8 BOM */
    csvWithoutBom: boolean
    /** 表格字号（px） */
    tableFontSize: number
}

export const QUERY_RESULT_PANE_SETTINGS_KEY = 'dw-cli-query-result-pane-settings'

export const DEFAULT_QUERY_RESULT_PANE_SETTINGS: QueryResultPaneSettings = {
    sortOrder: 'newest',
    keepExistingResults: false,
    showFieldTypes: true,
    showFieldComments: true,
    wrapCells: false,
    resultLayout: 'grid',
    columnDensity: 'standard',
    numericAlign: 'right',
    hideNullColumns: false,
    hideEmptyColumns: false,
    typeColoring: false,
    freezeFirstColumn: false,
    hideToolbarLabels: false,
    csvWithoutBom: false,
    tableFontSize: TABLE_FONT_SIZE_DEFAULT,
}

function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback
}

function asSortOrder(value: unknown): ResultPaneSortOrder {
    return value === 'oldest' || value === 'newest' ? value : DEFAULT_QUERY_RESULT_PANE_SETTINGS.sortOrder
}

function asResultLayout(value: unknown): ResultPaneLayout {
    return value === 'form' || value === 'grid' ? value : DEFAULT_QUERY_RESULT_PANE_SETTINGS.resultLayout
}

function asColumnDensity(value: unknown): ResultPaneColumnDensity {
    return value === 'compact' || value === 'standard' || value === 'relaxed'
        ? value
        : DEFAULT_QUERY_RESULT_PANE_SETTINGS.columnDensity
}

function asNumericAlign(value: unknown): ResultPaneNumericAlign {
    return value === 'left' || value === 'right' ? value : DEFAULT_QUERY_RESULT_PANE_SETTINGS.numericAlign
}

export function normalizeTableFontSize(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return TABLE_FONT_SIZE_DEFAULT
    return Math.min(TABLE_FONT_SIZE_MAX, Math.max(TABLE_FONT_SIZE_MIN, Math.round(value)))
}

export function columnDensityWidthScale(density: ResultPaneColumnDensity): number {
    if (density === 'compact') return 0.82
    if (density === 'relaxed') return 1.18
    return 1
}

export function readStoredQueryResultPaneSettings(): QueryResultPaneSettings {
    try {
        const raw = localStorage.getItem(QUERY_RESULT_PANE_SETTINGS_KEY)
        if (!raw) return {...DEFAULT_QUERY_RESULT_PANE_SETTINGS}
        const parsed = JSON.parse(raw) as Partial<QueryResultPaneSettings>
        return {
            sortOrder: asSortOrder(parsed.sortOrder),
            keepExistingResults: asBoolean(
                parsed.keepExistingResults,
                DEFAULT_QUERY_RESULT_PANE_SETTINGS.keepExistingResults,
            ),
            showFieldTypes: asBoolean(
                parsed.showFieldTypes,
                DEFAULT_QUERY_RESULT_PANE_SETTINGS.showFieldTypes,
            ),
            showFieldComments: asBoolean(
                parsed.showFieldComments,
                DEFAULT_QUERY_RESULT_PANE_SETTINGS.showFieldComments,
            ),
            wrapCells: asBoolean(parsed.wrapCells, DEFAULT_QUERY_RESULT_PANE_SETTINGS.wrapCells),
            resultLayout: asResultLayout(parsed.resultLayout),
            columnDensity: asColumnDensity(parsed.columnDensity),
            numericAlign: asNumericAlign(parsed.numericAlign),
            hideNullColumns: asBoolean(
                parsed.hideNullColumns,
                DEFAULT_QUERY_RESULT_PANE_SETTINGS.hideNullColumns,
            ),
            hideEmptyColumns: asBoolean(
                parsed.hideEmptyColumns,
                DEFAULT_QUERY_RESULT_PANE_SETTINGS.hideEmptyColumns,
            ),
            typeColoring: asBoolean(
                parsed.typeColoring,
                DEFAULT_QUERY_RESULT_PANE_SETTINGS.typeColoring,
            ),
            freezeFirstColumn: asBoolean(
                parsed.freezeFirstColumn,
                DEFAULT_QUERY_RESULT_PANE_SETTINGS.freezeFirstColumn,
            ),
            hideToolbarLabels: asBoolean(
                parsed.hideToolbarLabels,
                DEFAULT_QUERY_RESULT_PANE_SETTINGS.hideToolbarLabels,
            ),
            csvWithoutBom: asBoolean(
                parsed.csvWithoutBom,
                DEFAULT_QUERY_RESULT_PANE_SETTINGS.csvWithoutBom,
            ),
            tableFontSize: normalizeTableFontSize(parsed.tableFontSize),
        }
    } catch {
        return {...DEFAULT_QUERY_RESULT_PANE_SETTINGS}
    }
}

export function persistQueryResultPaneSettings(settings: QueryResultPaneSettings) {
    localStorage.setItem(QUERY_RESULT_PANE_SETTINGS_KEY, JSON.stringify(settings))
}

/** Map a display-order index to the chronological (storage) index. */
export function toStorageResultIndex(
    displayIndex: number,
    length: number,
    sortOrder: ResultPaneSortOrder,
): number {
    if (length <= 0 || displayIndex < 0 || displayIndex >= length) return displayIndex
    return sortOrder === 'newest' ? length - 1 - displayIndex : displayIndex
}

/** Map a chronological (storage) index to the display-order index. */
export function toDisplayResultIndex(
    storageIndex: number,
    length: number,
    sortOrder: ResultPaneSortOrder,
): number {
    if (length <= 0 || storageIndex < 0 || storageIndex >= length) return storageIndex
    return sortOrder === 'newest' ? length - 1 - storageIndex : storageIndex
}
