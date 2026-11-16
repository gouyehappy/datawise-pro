import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {ref} from 'vue'
import {
  resolveOrderedColumns,
  resolvePinnedDisplayColumns,
  useGridColumnLayout,
} from '@/core/data-grid/useGridColumnLayout'
import type {GridColumnLayoutState} from '@/core/data-grid/types'
import {createEmptyColumnLayoutState} from '@/core/data-grid/types'

describe('resolveOrderedColumns', () => {
  it('follows order and appends unknowns', () => {
    const columns = [{key: 'a'}, {key: 'b'}, {key: 'c'}]
    const ordered = resolveOrderedColumns(columns, ['c', 'a'], (col) => col.key)
    assert.deepEqual(ordered.map((c) => c.key), ['c', 'a', 'b'])
  })

  it('returns original when order empty', () => {
    const columns = [{key: 'a'}, {key: 'b'}]
    assert.deepEqual(resolveOrderedColumns(columns, [], (col) => col.key), columns)
  })
})

describe('resolvePinnedDisplayColumns', () => {
  it('moves left and right pins to edges', () => {
    const columns = [{key: 'a'}, {key: 'b'}, {key: 'c'}, {key: 'd'}]
    const next = resolvePinnedDisplayColumns(columns, ['c'], ['a'], (col) => col.key)
    assert.deepEqual(next.map((c) => c.key), ['c', 'b', 'd', 'a'])
  })

  it('preserves pin-list order within each side', () => {
    const columns = [{key: 'a'}, {key: 'b'}, {key: 'c'}, {key: 'd'}]
    const next = resolvePinnedDisplayColumns(columns, ['d', 'b'], ['c', 'a'], (col) => col.key)
    assert.deepEqual(next.map((c) => c.key), ['d', 'b', 'c', 'a'])
  })
})

describe('useGridColumnLayout field filter helpers', () => {
  const columns = [{key: 'a'}, {key: 'b'}, {key: 'c'}]

  function setup(initial?: Partial<GridColumnLayoutState>) {
    const layout = ref<GridColumnLayoutState | undefined>({
      ...createEmptyColumnLayoutState(),
      ...initial,
    })
    return useGridColumnLayout({
      columns: () => columns,
      columnKey: (col) => col.key,
      layout,
    })
  }

  it('refuses to hide the last visible column', () => {
    const api = setup({hiddenColumns: ['a', 'b']})
    assert.equal(api.setColumnHidden('c', true), false)
    assert.deepEqual(api.readLayout().hiddenColumns, ['a', 'b'])
  })

  it('inverts visibility and keeps one column when needed', () => {
    const api = setup({hiddenColumns: []})
    api.invertColumnVisibility()
    assert.deepEqual(api.readLayout().hiddenColumns, ['b', 'c'])
  })

  it('reorders including hidden columns', () => {
    const api = setup({hiddenColumns: ['b'], columnOrder: ['a', 'b', 'c']})
    api.moveColumnInFullOrder('c', 'a')
    assert.deepEqual(api.readLayout().columnOrder, ['c', 'a', 'b'])
  })

  it('resets order and clears remembered widths', () => {
    const api = setup({
      columnOrder: ['c', 'a', 'b'],
      columnWidths: {a: 120, b: 80},
    })
    api.resetColumnOrder()
    api.clearColumnWidths()
    assert.deepEqual(api.readLayout().columnOrder, [])
    assert.deepEqual(api.readLayout().columnWidths, {})
  })
})
