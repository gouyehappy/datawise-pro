import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    applyFormulaGuard,
    buildExportFileName,
    GRID_EXPORT_INCOMPLETE_CSV_MARKER,
    needsFormulaGuard,
    serializeGridData,
    serializeGridToCsv,
    serializeGridToJson,
    serializeGridToSql,
    serializeGridToTsv,
} from '../../features/workspace/services/grid-export.service.ts'

describe('grid-export.service', () => {
    const columns = [
        {name: 'id', key: 'id'},
        {name: 'tag_name', key: 'tag_name'},
    ]
    const rows = [
        {id: 1, tag_name: 'hello,world'},
        {id: 2, tag_name: 'line\nbreak'},
    ]

    it('buildExportFileName replaces extension', () => {
        assert.equal(buildExportFileName('result.csv', 'json'), 'result.json')
        assert.equal(buildExportFileName('Result 1', 'csv'), 'Result 1.csv')
    })

    it('serializeGridToCsv escapes commas and quotes', () => {
        const csv = serializeGridToCsv(columns, rows)
        assert.match(csv, /"hello,world"/)
        assert.match(csv, /"line\nbreak"/)
    })

    it('needsFormulaGuard covers OWASP triggers without harming decimals', () => {
        assert.equal(needsFormulaGuard('=1+1'), true)
        assert.equal(needsFormulaGuard('@SUM(A1)'), true)
        assert.equal(needsFormulaGuard('-2+1+cmd'), true)
        assert.equal(needsFormulaGuard(' =cmd'), true)
        assert.equal(needsFormulaGuard('-1.5'), false)
        assert.equal(needsFormulaGuard('-abc'), true)
        assert.equal(needsFormulaGuard('@冯十二'), false)
        assert.equal(needsFormulaGuard('plain'), false)
        assert.equal(applyFormulaGuard('=1+1'), "'=1+1")
        assert.equal(applyFormulaGuard('-1'), '-1')
    })

    it('serializeGridToCsv/Tsv prefixes formula-like cells', () => {
        const formulaCols = [{name: 'v', key: 'v'}]
        const formulaRows = [{v: '=1+1'}, {v: '@SUM(1)'}, {v: 'safe'}]
        const csv = serializeGridToCsv(formulaCols, formulaRows)
        assert.match(csv, /'=1\+1/)
        assert.match(csv, /'@SUM\(1\)/)
        assert.match(csv, /safe/)
        const tsv = serializeGridToTsv(formulaCols, formulaRows)
        assert.match(tsv, /'=1\+1/)
    })

    it('serializeGridToJson preserves column names', () => {
        const parsed = JSON.parse(serializeGridToJson(columns, rows)) as Array<Record<string, unknown>>
        assert.equal(parsed.length, 2)
        assert.equal(parsed[0]?.tag_name, 'hello,world')
    })

    it('serializeGridToSql quotes strings and keeps numbers', () => {
        const sql = serializeGridToSql(columns, rows, 'cdp_tag')
        assert.match(sql, /INSERT INTO cdp_tag/)
        assert.match(sql, /'hello,world'/)
        assert.match(sql, /\(1,/)
    })

    it('marks incomplete text and json exports', () => {
        const csv = serializeGridData(columns, rows, 'csv', undefined, {incomplete: true})
        assert.ok(csv.startsWith(GRID_EXPORT_INCOMPLETE_CSV_MARKER))
        const json = JSON.parse(serializeGridData(columns, rows, 'json', undefined, {incomplete: true})) as {
            incomplete: boolean
            rows: unknown[]
        }
        assert.equal(json.incomplete, true)
        assert.equal(json.rows.length, 2)
    })
})
