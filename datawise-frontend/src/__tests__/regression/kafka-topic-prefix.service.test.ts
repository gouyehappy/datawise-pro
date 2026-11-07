import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    deriveTopicPrefixPatterns,
    filterKafkaTopics,
    groupKafkaTopicsByPrefix,
    normalizeKafkaTopicPattern,
} from '@/features/explorer/services/kafka-topic-prefix.service'

describe('kafka-topic-prefix.service', () => {
    it('groups topics by first delimiter prefix', () => {
        const groups = groupKafkaTopicsByPrefix([
            'cp-test',
            'cp-test1',
            'sdp-topic-dimension-a002-default',
            'plain',
            'CREDIT-GW-foo',
        ])
        assert.deepEqual(groups.find((g) => g.prefix === 'cp-')?.topics, ['cp-test', 'cp-test1'])
        assert.deepEqual(groups.find((g) => g.prefix === 'sdp-')?.topics, ['sdp-topic-dimension-a002-default'])
        assert.equal(deriveTopicPrefixPatterns(['cp-a', 'sdp-b', 'cp-c']).includes('cp-*'), true)
    })

    it('normalizes topic pattern like redis scan', () => {
        assert.equal(normalizeKafkaTopicPattern(''), '*')
        assert.equal(normalizeKafkaTopicPattern('orders-*'), 'orders-*')
        assert.equal(normalizeKafkaTopicPattern('orders'), 'orders*')
    })

    it('filters topics locally', () => {
        assert.deepEqual(filterKafkaTopics(['a', 'abc'], 'ab'), ['abc'])
    })
})
