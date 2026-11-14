import type {TableColumn, TableRow} from '@/core/types'
import type {TableColumnDetail} from '@/shared/api/types'
import type {GridPendingBatch} from '@/core/composables/useGridPendingEdit'

/** Result payload bound into the grid body. */
export type DataGridSourceConfig = {
  columns: TableColumn[]
  rows: TableRow[]
  total?: number
  where?: string
  orderBy?: string
  columnDetails?: TableColumnDetail[]
  pkColumns?: string[]
  tableAutoIncrement?: string | null
  hasMore?: boolean
  loading?: boolean
  cursorLoading?: boolean
  cursorTrimmedRows?: number
  truncatedAtCap?: boolean
  truncatedCapRows?: number
  canRaiseMaxRows?: boolean
  productionPerfActive?: boolean
}

/** DML / mutation affordances. */
export type DataGridEditConfig = {
  editable?: boolean
  readOnlyHint?: string
  canDelete?: boolean
  canUpdate?: boolean
  showDmlActions?: boolean
  onSubmitChanges?: (batch: GridPendingBatch) => Promise<boolean>
}

/** Toolbar / export / AI / document actions. */
export type DataGridChromeConfig = {
  showFilter?: boolean
  fullToolbar?: boolean
  exportBaseName?: string
  exportTableName?: string
  suggestExportMask?: boolean
  showExport?: boolean
  showAiSummary?: boolean
  aiSummaryLoading?: boolean
  showFakeData?: boolean
  enableRowDocumentView?: boolean
  enableSqlFill?: boolean
  connectionId?: string
  database?: string
  externalViewOptions?: boolean
}

/** Presentation preferences. */
export type DataGridViewConfig = {
  showFieldTypes?: boolean
  showFieldComments?: boolean
  wrapCells?: boolean
  layoutMode?: 'grid' | 'form'
  columnDensity?: 'compact' | 'standard' | 'relaxed'
  numericAlign?: 'left' | 'right'
  hideNullColumns?: boolean
  typeColoring?: boolean
}

export type DataGridGroupedProps = {
  source: DataGridSourceConfig
  edit?: DataGridEditConfig
  chrome?: DataGridChromeConfig
  view?: DataGridViewConfig
}

export const DATA_GRID_EDIT_DEFAULTS: Required<
  Omit<DataGridEditConfig, 'readOnlyHint' | 'onSubmitChanges'>
> & Pick<DataGridEditConfig, 'readOnlyHint' | 'onSubmitChanges'> = {
  editable: false,
  readOnlyHint: undefined,
  canDelete: false,
  canUpdate: false,
  showDmlActions: false,
  onSubmitChanges: undefined,
}

export const DATA_GRID_CHROME_DEFAULTS: DataGridChromeConfig = {
  showFilter: false,
  fullToolbar: false,
  exportBaseName: 'query_result',
  exportTableName: undefined,
  suggestExportMask: false,
  showExport: true,
  showAiSummary: false,
  aiSummaryLoading: false,
  showFakeData: false,
  enableRowDocumentView: false,
  enableSqlFill: false,
  connectionId: undefined,
  database: undefined,
  externalViewOptions: false,
}

export const DATA_GRID_VIEW_DEFAULTS: Required<DataGridViewConfig> = {
  showFieldTypes: true,
  showFieldComments: true,
  wrapCells: false,
  layoutMode: 'grid',
  columnDensity: 'standard',
  numericAlign: 'right',
  hideNullColumns: false,
  typeColoring: false,
}

/** Flatten grouped configs for internal grid logic / legacy call sites. */
export function flattenDataGridProps(groups: DataGridGroupedProps) {
  return {
    ...groups.source,
    ...DATA_GRID_EDIT_DEFAULTS,
    ...groups.edit,
    ...DATA_GRID_CHROME_DEFAULTS,
    ...groups.chrome,
    ...DATA_GRID_VIEW_DEFAULTS,
    ...groups.view,
    total: groups.source.total ?? 0,
    columnDetails: groups.source.columnDetails ?? [],
    pkColumns: groups.source.pkColumns ?? [],
  }
}
