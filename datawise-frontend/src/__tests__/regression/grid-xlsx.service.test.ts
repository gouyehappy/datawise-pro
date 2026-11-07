import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {buildExportFileName} from '@/features/workspace/services/grid-export.service'
import {
    parseXlsxBuffer,
    readReportXlsxMeta,
    serializeGridToXlsxBuffer,
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
        assert.ok(meta.numericColumnFormats.some((format) => format.includes('#,##0')))
    })
})
