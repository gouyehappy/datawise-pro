import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {appendExportWatermark} from '@/features/workspace/data-grid/services/grid-export.service'

describe('appendExportWatermark', () => {
    it('appends sql comment footer', () => {
        const out = appendExportWatermark('select 1;\n', 'sql', 'DataWise Trial')
        assert.match(out, /-- DataWise Trial/)
    })

    it('skips json and empty footer', () => {
        assert.equal(appendExportWatermark('[]', 'json', 'x'), '[]')
        assert.equal(appendExportWatermark('a', 'csv', null), 'a')
    })
})
