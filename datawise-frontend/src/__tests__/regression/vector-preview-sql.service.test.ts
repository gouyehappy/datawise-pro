import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildVectorPreviewSql,
    isVectorColumnType,
    parseVectorLiteral,
    supportsVectorPreview,
} from '@/features/workspace/services/vector-preview-sql.service'

describe('vector-preview-sql.service', () => {
    it('detects pgvector columns and dialects', () => {
        assert.equal(isVectorColumnType('vector(1536)'), true)
        assert.equal(isVectorColumnType('varchar(32)'), false)
        assert.equal(supportsVectorPreview('postgresql'), true)
        assert.equal(supportsVectorPreview('mysql'), false)
    })

    it('parses vector literals and builds preview SQL', () => {
        assert.equal(parseVectorLiteral('1, 2, 3'), '[1,2,3]')
        assert.equal(parseVectorLiteral('[0.1, -2]'), '[0.1,-2]')
        assert.equal(parseVectorLiteral('not a vector'), null)
        const sql = buildVectorPreviewSql({
            dbType: 'postgresql',
            database: 'app',
            tableName: 'docs',
            columnName: 'embedding',
            vectorText: '0.1, 0.2',
            limit: 5,
        })
        assert.match(sql ?? '', /<=> '\[0\.1,0\.2\]'::vector/)
        assert.match(sql ?? '', /LIMIT 5/)
        assert.equal(buildVectorPreviewSql({
            dbType: 'mysql',
            tableName: 'docs',
            columnName: 'embedding',
            vectorText: '1,2',
        }), null)
    })
})
