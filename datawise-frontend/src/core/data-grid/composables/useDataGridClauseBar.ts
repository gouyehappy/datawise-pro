import {computed, ref, watch, type Ref} from 'vue'
import {columnRowKey} from '@/core/utils/query-result-column'
import type {TableColumn} from '@/core/types'
import type {GridViewState} from '@/core/data-grid/services/grid-view-state.service'
import {
  formatOrderClauses,
  parseOrderClauses,
} from '@/core/data-grid/services/grid-clause-bar.service'
import {compileWhereExpression} from '@/core/data-grid/services/grid-where-expression.service'
import {resolveSortSpecs} from '@/core/data-grid/services/grid-view-state.service'

/**
 * WHERE / ORDER draft sync for DataGrid ClauseBar.
 */
export function useDataGridClauseBar(options: {
  viewState: Ref<GridViewState | undefined>
  displayColumns: () => TableColumn[]
  columnTypeLabel: (column: TableColumn) => string
}) {
  const whereClauseDraft = ref('')
  const orderClauseDraft = ref('')
  const whereClauseInvalid = ref(false)
  const orderClauseInvalid = ref(false)
  const clauseBarFocused = ref(false)
  const clauseApplying = ref(false)
  const committedWhere = ref('')
  const committedOrder = ref('')

  const filterColumnHints = computed(() =>
      options.displayColumns().map((col) => ({
        name: col.name,
        type: options.columnTypeLabel(col),
      })),
  )

  function resolveColumnByName(name: string): TableColumn | undefined {
    const lower = name.toLowerCase()
    return options.displayColumns().find((col) => col.name.toLowerCase() === lower)
  }

  function expectedWhereFromViewState(): string {
    const state = options.viewState.value
    if (!state) return ''
    if (state.whereExpression?.trim()) return state.whereExpression
    const entries = Object.entries(state.columnFilters).filter(([, value]) => value.trim())
    if (entries.length !== 1) return ''
    const [columnKey, value] = entries[0]!
    const column = options.displayColumns().find(
        (entry) => columnRowKey(entry) === columnKey || entry.name === columnKey,
    )
    return column ? `${column.name} = ${value}` : ''
  }

  function expectedOrderFromViewState(): string {
    const state = options.viewState.value
    if (!state) return ''
    const specs = resolveSortSpecs(state)
    if (!specs.length) return ''
    const named = specs.map((spec) => {
      const column = options.displayColumns().find(
          (entry) =>
              columnRowKey(entry) === spec.column
              || entry.name === spec.column,
      )
      return column
          ? {column: column.name, direction: spec.direction}
          : null
    }).filter((item): item is {column: string; direction: 'asc' | 'desc'} => item != null)
    return formatOrderClauses(named)
  }

  function syncClauseDraftsFromViewState() {
    if (!options.viewState.value) {
      whereClauseDraft.value = ''
      orderClauseDraft.value = ''
      committedWhere.value = ''
      committedOrder.value = ''
      whereClauseInvalid.value = false
      orderClauseInvalid.value = false
      return
    }
    if (clauseBarFocused.value || clauseApplying.value) return

    const nextWhere = expectedWhereFromViewState()
    const nextOrder = expectedOrderFromViewState()
    if (whereClauseDraft.value === committedWhere.value) {
      whereClauseDraft.value = nextWhere
      committedWhere.value = nextWhere
    }
    if (orderClauseDraft.value === committedOrder.value) {
      orderClauseDraft.value = nextOrder
      committedOrder.value = nextOrder
    }
    whereClauseInvalid.value = false
    orderClauseInvalid.value = false
  }

  function applyClauseBar(applyOptions?: {validate?: boolean}) {
    if (!options.viewState.value) return
    const validate = applyOptions?.validate !== false
    clauseApplying.value = true
    try {
      const whereText = whereClauseDraft.value.trim()
      const orderText = orderClauseDraft.value.trim()

      let whereExpression = ''
      let whereOk = true
      if (whereText) {
        const compiled = compileWhereExpression(whereText)
        if (!compiled.ok) {
          whereOk = false
          if (validate) whereClauseInvalid.value = true
        } else {
          whereClauseInvalid.value = false
          whereExpression = whereText
        }
      } else {
        whereClauseInvalid.value = false
      }

      let sortColumn: string | null = null
      let sortDirection: 'asc' | 'desc' | null = null
      let sortSpecs: Array<{column: string; direction: 'asc' | 'desc'}> = []
      let orderOk = true
      let normalizedOrder = orderText
      if (orderText) {
        const parsed = parseOrderClauses(orderText)
        const resolved = parsed
            ? parsed.map((item) => {
              const column = resolveColumnByName(item.column)
              return column
                  ? {column, direction: item.direction}
                  : null
            })
            : null
        if (!parsed || !resolved || resolved.some((item) => !item)) {
          orderOk = false
          if (validate) orderClauseInvalid.value = true
        } else {
          orderClauseInvalid.value = false
          const named = resolved.map((item) => ({
            column: item!.column.name,
            direction: item!.direction,
          }))
          sortSpecs = resolved.map((item) => ({
            column: columnRowKey(item!.column),
            direction: item!.direction,
          }))
          sortColumn = sortSpecs[0]?.column ?? null
          sortDirection = sortSpecs[0]?.direction ?? null
          normalizedOrder = formatOrderClauses(named)
        }
      } else {
        orderClauseInvalid.value = false
      }

      if (!whereOk || !orderOk) {
        return
      }

      if (orderText) {
        orderClauseDraft.value = normalizedOrder
      }

      options.viewState.value = {
        ...options.viewState.value,
        whereExpression,
        columnFilters: {},
        sortColumn,
        sortDirection,
        sortSpecs,
      }
      committedWhere.value = whereClauseDraft.value
      committedOrder.value = orderClauseDraft.value
    } finally {
      window.setTimeout(() => {
        clauseApplying.value = false
      }, 0)
    }
  }

  function onClauseBarFocusChange(focused: boolean) {
    clauseBarFocused.value = focused
  }

  watch(
      () => options.viewState.value,
      () => {
        syncClauseDraftsFromViewState()
      },
      {deep: true, immediate: true},
  )

  watch([whereClauseDraft, orderClauseDraft], () => {
    if (clauseApplying.value) return
    whereClauseInvalid.value = false
    orderClauseInvalid.value = false
  })

  return {
    filterColumnHints,
    whereClauseDraft,
    orderClauseDraft,
    whereClauseInvalid,
    orderClauseInvalid,
    clauseBarFocused,
    applyClauseBar,
    onClauseBarFocusChange,
    syncClauseDraftsFromViewState,
  }
}
