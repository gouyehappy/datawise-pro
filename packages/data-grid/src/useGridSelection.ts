import {computed, ref, type Ref} from 'vue'
import type {GridRowId, GridSelectionState} from './types'

/**
 * Row selection: primary row + multi-select (Ctrl/Shift), AG-community style.
 */
export function useGridSelection(options?: {
  /** Sync primary selection to an external ref (e.g. pending-edit selectedRowId). */
  externalPrimaryId?: Ref<string | null>
}) {
  const selectedIds = ref<Set<GridRowId>>(new Set())
  const anchorId = ref<GridRowId | null>(null)
  const internalPrimary = ref<GridRowId | null>(null)

  const primaryId = computed({
    get: () => options?.externalPrimaryId?.value ?? internalPrimary.value,
    set: (value: GridRowId | null) => {
      if (options?.externalPrimaryId) {
        options.externalPrimaryId.value = value
      } else {
        internalPrimary.value = value
      }
    },
  })

  function snapshot(): GridSelectionState {
    return {
      primaryId: primaryId.value,
      selectedIds: new Set(selectedIds.value),
      anchorId: anchorId.value,
    }
  }

  function clearSelection() {
    selectedIds.value = new Set()
    anchorId.value = null
    primaryId.value = null
  }

  function selectOnly(rowId: GridRowId) {
    selectedIds.value = new Set([rowId])
    anchorId.value = rowId
    primaryId.value = rowId
  }

  function toggle(rowId: GridRowId) {
    const next = new Set(selectedIds.value)
    if (next.has(rowId)) next.delete(rowId)
    else next.add(rowId)
    selectedIds.value = next
    primaryId.value = rowId
    if (!anchorId.value) anchorId.value = rowId
  }

  function selectRange(rowIdsInOrder: readonly GridRowId[], toId: GridRowId) {
    const anchor = anchorId.value ?? primaryId.value ?? toId
    const fromIndex = rowIdsInOrder.indexOf(anchor)
    const toIndex = rowIdsInOrder.indexOf(toId)
    if (fromIndex < 0 || toIndex < 0) {
      selectOnly(toId)
      return
    }
    const [start, end] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex]
    const next = new Set<GridRowId>()
    for (let i = start; i <= end; i++) {
      const id = rowIdsInOrder[i]
      if (id) next.add(id)
    }
    selectedIds.value = next
    primaryId.value = toId
  }

  /** Mouse click with modifiers. */
  function onRowClick(
      rowId: GridRowId,
      rowIdsInOrder: readonly GridRowId[],
      event: {ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean},
  ) {
    if (event.shiftKey) {
      selectRange(rowIdsInOrder, rowId)
      return
    }
    if (event.ctrlKey || event.metaKey) {
      toggle(rowId)
      return
    }
    selectOnly(rowId)
  }

  function isSelected(rowId: GridRowId): boolean {
    return selectedIds.value.has(rowId) || primaryId.value === rowId
  }

  return {
    primaryId,
    selectedIds,
    anchorId,
    snapshot,
    clearSelection,
    selectOnly,
    toggle,
    selectRange,
    onRowClick,
    isSelected,
  }
}
