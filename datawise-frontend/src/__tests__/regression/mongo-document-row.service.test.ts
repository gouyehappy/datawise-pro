import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TableColumn, TableRow} from '@/core/types'
import {
    buildDocumentFromGridRow,
    formatMongoDocumentJson,
    resolveMongoDocumentRowLabel,
    reviveMongoCellValue,
} from '@/features/workspace/services/mongo-document-row.service'

describe('mongo-document-row.service', () => {
    it('revives nested JSON strings and leaves scalars', () => {
        assert.deepEqual(reviveMongoCellValue('{"a":1}'), {a: 1})
        assert.deepEqual(reviveMongoCellValue('[1,2]'), [1, 2])
        assert.equal(reviveMongoCellValue('plain'), 'plain')
        assert.equal(reviveMongoCellValue(3), 3)
        assert.equal(reviveMongoCellValue(null), null)
    })

    it('builds a document from grid columns and row keys', () => {
        const columns: TableColumn[] = [
            {key: 'c1', name: '_id', type: 'objectId'},
            {key: 'c2', name: 'profile', type: 'object'},
            {key: 'c3', name: 'count', type: 'integer'},
        ]
        const row: TableRow = {
            c1: '507f1f77bcf86cd799439011',
            c2: '{"city":"SH"}',
            c3: 2,
        }
        const doc = buildDocumentFromGridRow(columns, row)
        assert.deepEqual(doc, {
            _id: '507f1f77bcf86cd799439011',
            profile: {city: 'SH'},
            count: 2,
        })
        assert.match(formatMongoDocumentJson(doc), /"city": "SH"/)
        assert.equal(
            resolveMongoDocumentRowLabel(doc, 4),
            '#4 · _id 507f1f77bcf86cd799439011',
        )
    })
})
