import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildCrossEnvCompareReportHtml,
    buildSchemaCompareReportHtml,
    escapeHtml,
} from '@/features/pack/services/governance-compare-report'
import type {SchemaCompareResult, SchemaScope} from '@/features/schema-compare/types/schema-compare.types'
import type {QueryResultDiffView} from '@/features/workspace/services/query-result-diff.service'

const left: SchemaScope = {
    connectionId: 'c1',
    database: 'db_a',
    connectionLabel: 'Dev',
    dbType: 'mysql',
}

const right: SchemaScope = {
    connectionId: 'c2',
    database: 'db_b',
    connectionLabel: 'Prod',
    dbType: 'mysql',
}

describe('governance-compare-report', () => {
    it('escapes HTML entities', () => {
        assert.equal(escapeHtml('<script>"x"&'), '&lt;script&gt;&quot;x&quot;&amp;')
    })

    it('builds a full schema compare HTML report with conflicts and watermark', () => {
        const result: SchemaCompareResult = {
            tableDiffs: [
                {
                    tableName: 'orders',
                    status: 'changed',
                    columnDiffs: [
                        {
                            name: 'amount',
                            status: 'modified',
                            left: {
                                name: 'amount',
                                dataType: 'INT',
                                nullable: false,
                                autoIncrement: false,
                            },
                            right: {
                                name: 'amount',
                                dataType: 'BIGINT',
                                nullable: false,
                                autoIncrement: false,
                            },
                            changes: ['dataType'],
                        },
                    ],
                },
                {tableName: 'stable', status: 'unchanged', columnDiffs: []},
            ],
            ddl: 'ALTER TABLE orders MODIFY amount BIGINT;',
            summary: {added: 0, removed: 0, changed: 1, unchanged: 1},
            createDdls: {},
        }

        const html = buildSchemaCompareReportHtml({
            left,
            right,
            result,
            ddl: result.ddl,
            title: 'Schema Compare Report',
            generatedAt: new Date('2026-08-01T00:00:00.000Z'),
            watermarkFooter: 'DataWise Trial',
        })

        assert.match(html, /Schema Compare Report/)
        assert.match(html, /Dev \/ db_a/)
        assert.match(html, /Prod \/ db_b/)
        assert.match(html, /orders/)
        assert.match(html, /BIGINT/)
        assert.match(html, /ALTER TABLE orders/)
        assert.match(html, /DataWise Trial/)
        assert.doesNotMatch(html, /stable/)
        assert.match(html, /@media print/)
        assert.match(html, /Save as PDF/)
    })

    it('builds a cross-env compare HTML report with changed rows', () => {
        const diff: QueryResultDiffView = {
            baselineLabel: 'left',
            currentLabel: 'right',
            columns: [{name: 'id', type: 'number'}, {name: 'name', type: 'string'}],
            rows: [
                {
                    id: 'r0',
                    rowStatus: 'modified',
                    cells: {
                        id: {display: '1', status: 'unchanged'},
                        name: {display: 'bob', previous: 'alice', status: 'modified'},
                    },
                },
                {
                    id: 'r1',
                    rowStatus: 'unchanged',
                    cells: {
                        id: {display: '2', status: 'unchanged'},
                        name: {display: 'carol', status: 'unchanged'},
                    },
                },
            ],
            summary: {
                unchangedRows: 1,
                modifiedRows: 1,
                addedRows: 0,
                removedRows: 0,
                changedCells: 1,
            },
        }

        const html = buildCrossEnvCompareReportHtml({
            left,
            right,
            sql: 'SELECT * FROM t',
            sampleRows: 100,
            diff,
            title: 'Cross-env Compare Report',
            generatedAt: new Date('2026-08-01T00:00:00.000Z'),
        })

        assert.match(html, /Cross-env Compare Report/)
        assert.match(html, /SELECT \* FROM t/)
        assert.match(html, /alice → bob/)
        assert.doesNotMatch(html, />carol</)
        assert.match(html, /Modified 1/)
    })
})
