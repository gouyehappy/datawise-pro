import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveOrderedColumns,
  resolvePinnedDisplayColumns,
} from '@/core/data-grid/useGridColumnLayout'

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
