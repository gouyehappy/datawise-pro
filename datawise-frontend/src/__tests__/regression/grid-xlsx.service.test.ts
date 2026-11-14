import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {buildExportFileName} from '@/features/workspace/services/grid-export.service'
import {
    decimalFractionDigits,
    parseXlsxBuffer,
    readReportXlsxMeta,
    serializeGridToXlsxBuffer,
    shouldKeepNumericStringAsText,
} from '@/features/workspace/services/grid-xlsx.service'

describe('grid-xlsx.service', () => {
    const columns = [
        {name: 'id', key: 'id'},
        {name: 'amount', key: 'amount'},
        {name: 'name', key: 'name'},
    ]
    const rows = [
        {id: 1, amount: 1234567.89, name: 'alpha'},
        {id: 2, amount: 2500, name: 'beta,comma'},
    ]

    it('keeps leading-zero and oversize digit strings as text', () => {
        assert.equal(shouldKeepNumericStringAsText('007'), true)
        assert.equal(shouldKeepNumericStringAsText('1.230'), false)
        assert.equal(shouldKeepNumericStringAsText('1234567890123456'), true)
        assert.equal(shouldKeepNumericStringAsText('1.5e10'), true)
        assert.equal(shouldKeepNumericStringAsText('42'), false)
        assert.equal(decimalFractionDigits('1.230'), 3)
    })

    it('buildExportFileName supports xlsx', () => {
        assert.equal(buildExportFileName('query_result', 'xlsx'), 'query_result.xlsx')
    })

    it('round-trips grid data through xlsx buffer', async () => {
        const buffer = await serializeGridToXlsxBuffer(columns, rows)
        assert.ok(buffer.byteLength > 0)
        const parsed = await parseXlsxBuffer(buffer)
        assert.deepEqual(parsed.headers, ['id', 'amount', 'name'])
        assert.equal(parsed.rows.length, 2)
        assert.equal(parsed.rows[0]?.[0], '1')
        assert.equal(parsed.rows[1]?.[2], 'beta,comma')
    })

    it('applies report styling metadata to xlsx export', async () => {
        const buffer = await serializeGridToXlsxBuffer(columns, rows, {sheetName: 'Daily Report'})
        const meta = await readReportXlsxMeta(buffer)
        assert.equal(meta.sheetName, 'Daily Report')
        assert.deepEqual(meta.headers, ['id', 'amount', 'name'])
        assert.equal(meta.rowCount, 2)
        assert.equal(meta.frozen, true)
        assert.equal(meta.headerBold, true)
        assert.ok(meta.numericColumnFormats.some((format) => /0\.00|#,\s*##0/.test(format)))
    })

    it('preserves leading zeros and trailing fractional scale on export', async () => {
        const fidelityCols = [
            {name: 'code', key: 'code'},
            {name: 'rate', key: 'rate'},
        ]
        const fidelityRows = [
            {code: '007', rate: '1.230'},
            {code: '008', rate: '2.500'},
        ]
        const buffer = await serializeGridToXlsxBuffer(fidelityCols, fidelityRows)
        const parsed = await parseXlsxBuffer(buffer)
        assert.equal(parsed.rows[0]?.[0], '007')
        assert.equal(parsed.rows[1]?.[0], '008')
        const meta = await readReportXlsxMeta(buffer)
        assert.ok(meta.numericColumnFormats.some((format) => format === '0.000'))
    })
})
