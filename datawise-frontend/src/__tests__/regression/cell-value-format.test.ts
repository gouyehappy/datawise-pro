import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    formatCellDisplayValue,
    formatCellFullValue,
    formatCellPreviewValue,
    isExpandableCellValue,
    unwrapCellValue,
} from '@/core/utils/cell-value-format'

describe('cell-value-format', () => {
    it('stringifies json objects instead of [object Object]', () => {
        assert.equal(formatCellDisplayValue({source: 'doc'}), '{"source":"doc"}')
    })

    it('keeps scalar values', () => {
        assert.equal(formatCellDisplayValue('hello'), 'hello')
        assert.equal(formatCellDisplayValue(42), '42')
    })

    it('truncates very long values', () => {
        const long = 'x'.repeat(900)
        assert.equal(formatCellDisplayValue(long).endsWith('…'), true)
    })

    it('unwraps pgobject-like {type,value} payloads', () => {
        const vector = '[0.1,0.2]'
        assert.equal(unwrapCellValue({type: 'vector', value: vector}), vector)
        assert.ok(formatCellFullValue({type: 'vector', value: vector}).includes('0.1'))
    })

    it('pretty-prints json strings in full value only', () => {
        const json = '{"knowledgeId":1}'
        assert.ok(formatCellFullValue(json).includes('"knowledgeId": 1'))
        // Grid preview must stay compact — no JSON.parse on every visible cell.
        assert.equal(formatCellPreviewValue(json), json)
        assert.equal(formatCellDisplayValue(json), json)
    })

    it('marks long or structured values as expandable', () => {
        assert.equal(isExpandableCellValue('short'), false)
        assert.equal(isExpandableCellValue({type: 'json', value: '{}'}), true)
        assert.equal(isExpandableCellValue('x'.repeat(200)), true)
    })

    it('preview is shorter than full for long text', () => {
        const long = 'y'.repeat(200)
        assert.ok(formatCellPreviewValue(long).length < formatCellFullValue(long).length)
    })
})
