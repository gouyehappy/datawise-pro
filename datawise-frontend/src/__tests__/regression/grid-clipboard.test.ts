import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {cellsToTsv, tsvToMatrix} from '@/core/data-grid/useGridClipboard'

describe('grid clipboard TSV', () => {
  it('round-trips simple matrix', () => {
    const matrix = [
      ['a', 'b'],
      ['c', 'd'],
    ]
    assert.deepEqual(tsvToMatrix(cellsToTsv(matrix)), matrix)
  })

  it('escapes tabs and quotes', () => {
    const matrix = [['he said "hi"', 'a\tb']]
    assert.deepEqual(tsvToMatrix(cellsToTsv(matrix)), matrix)
  })
})
