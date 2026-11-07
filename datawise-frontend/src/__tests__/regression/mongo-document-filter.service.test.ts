import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {normalizeMongoDocumentFilter} from '@/features/workspace/services/mongo-document-filter.service'

describe('mongo-document-filter.service', () => {
    it('treats blank as no filter', () => {
        assert.deepEqual(normalizeMongoDocumentFilter(''), {})
        assert.deepEqual(normalizeMongoDocumentFilter('   '), {})
        assert.deepEqual(normalizeMongoDocumentFilter(undefined), {})
    })

    it('normalizes valid object JSON', () => {
        const result = normalizeMongoDocumentFilter('{"status": "active", "n": 1}')
        assert.equal(result.error, undefined)
        assert.equal(result.filter, '{"status":"active","n":1}')
    })

    it('rejects invalid JSON and non-objects', () => {
        assert.equal(normalizeMongoDocumentFilter('{status').error, 'invalidJson')
        assert.equal(normalizeMongoDocumentFilter('[]').error, 'notObject')
        assert.equal(normalizeMongoDocumentFilter('"x"').error, 'notObject')
        assert.equal(normalizeMongoDocumentFilter('1').error, 'notObject')
    })
})
