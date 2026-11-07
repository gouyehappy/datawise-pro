import {describe, expect, it} from 'vitest'
import {classifyElasticsearchRequestRisk} from '@/features/elasticsearch/services/elasticsearch-request-risk'

describe('elasticsearch-request-risk', () => {
    it('classifies read, write, and dangerous requests', () => {
        expect(classifyElasticsearchRequestRisk('GET /_cat/indices')).toBe('read')
        expect(classifyElasticsearchRequestRisk('POST /logs/_search\n{}')).toBe('read')
        expect(classifyElasticsearchRequestRisk('POST /logs/_doc\n{}')).toBe('write')
        expect(classifyElasticsearchRequestRisk('POST /logs/_delete_by_query\n{}')).toBe('dangerous')
        expect(classifyElasticsearchRequestRisk('SELECT * FROM logs')).toBeNull()
    })
})