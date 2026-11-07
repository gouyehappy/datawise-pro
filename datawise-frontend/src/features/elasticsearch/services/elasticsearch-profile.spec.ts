import {describe, expect, it} from 'vitest'
import {formatElasticsearchRestRequest} from '@/features/elasticsearch/services/elasticsearch-formatter'
import {
    formatProfileNanos,
    parseElasticsearchProfile,
} from '@/features/elasticsearch/services/elasticsearch-profile'

describe('elasticsearch-profile', () => {
    it('parses profile shards into a timing tree', () => {
        const body = JSON.stringify({
            profile: {
                shards: [
                    {
                        id: '[node][index][0]',
                        searches: [
                            {
                                query: [
                                    {
                                        type: 'BooleanQuery',
                                        description: 'match_all',
                                        time_in_nanos: 1000,
                                        children: [
                                            {
                                                type: 'MatchAllDocsQuery',
                                                time_in_nanos: 400,
                                                children: [],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        })
        const parsed = parseElasticsearchProfile(body)
        expect(parsed?.shards).toHaveLength(1)
        expect(parsed?.shards[0].tree.type).toBe('BooleanQuery')
        expect(parsed?.shards[0].tree.children[0].type).toBe('MatchAllDocsQuery')
        expect(parsed?.shards[0].tree.isCriticalPath).toBe(true)
        expect(formatProfileNanos(1_500_000)).toBe('1.5ms')
    })

    it('returns null without profile section', () => {
        expect(parseElasticsearchProfile('{"hits":{}}')).toBeNull()
    })
})

describe('elasticsearch-formatter', () => {
    it('pretty-prints request bodies', () => {
        const formatted = formatElasticsearchRestRequest('POST /logs/_search\n{"query":{"match_all":{}}}')
        expect(formatted).toContain('POST /logs/_search')
        expect(formatted).toContain('"match_all"')
        expect(formatted?.includes('\n')).toBe(true)
    })
})
