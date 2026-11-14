import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    deriveTopicPrefixPatterns,
    filterKafkaTopics,
    groupKafkaTopicsByPrefix,
    kafkaTopicGroupHasMore,
    KAFKA_TOPICS_VIRTUAL_PAGE,
    normalizeKafkaTopicPattern,
    sliceKafkaTopicsVirtualPage,
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

    it('slices large topic groups for DOM virtual pages (PERF-04)', () => {
        const topics = Array.from({length: KAFKA_TOPICS_VIRTUAL_PAGE + 25}, (_, i) => `t-${i}`)
        assert.equal(sliceKafkaTopicsVirtualPage(topics, false).length, KAFKA_TOPICS_VIRTUAL_PAGE)
        assert.equal(kafkaTopicGroupHasMore(topics, false), true)
        assert.equal(sliceKafkaTopicsVirtualPage(topics, true).length, topics.length)
        assert.equal(kafkaTopicGroupHasMore(topics, true), false)
    })
})
