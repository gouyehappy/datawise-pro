import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    isSuiteRecommendedForPersona,
    orderSuitesForPersona,
    recommendedSuiteIdForPersona,
} from '@/features/pack/services/pack-store-persona'

describe('pack-store-persona', () => {
    it('maps DBA to Enterprise and analyst to Pro', () => {
        assert.equal(recommendedSuiteIdForPersona('dba'), 'suite.enterprise')
        assert.equal(recommendedSuiteIdForPersona('analyst'), 'suite.pro')
        assert.equal(recommendedSuiteIdForPersona('general'), 'suite.pro')
    })

    it('orders recommended suite first', () => {
        const dba = orderSuitesForPersona('dba')
        assert.equal(dba[0]?.id, 'suite.enterprise')
        assert.equal(isSuiteRecommendedForPersona('suite.enterprise', 'dba'), true)
        assert.equal(isSuiteRecommendedForPersona('suite.pro', 'dba'), false)

        const analyst = orderSuitesForPersona('analyst')
        assert.equal(analyst[0]?.id, 'suite.pro')
    })
})
