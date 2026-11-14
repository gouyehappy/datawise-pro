import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {PACK_AI_OFFLINE_ID} from '@/features/pack/types/pack.types'
import {
    resolvePackLayer,
    resolvePaywallLayer,
    resolveSuiteLayer,
} from '@/features/pack/services/pack-layer'

describe('pack-layer', () => {
    it('B3-1: maps packs onto Core/Team/Insight/Extend human layers', () => {
        assert.equal(resolvePackLayer('pack.ai'), 'insight')
        assert.equal(resolvePackLayer(PACK_AI_OFFLINE_ID), 'insight')
        assert.equal(resolvePackLayer('pack.governance'), 'team')
        assert.equal(resolvePackLayer('pack.security'), 'team')
        assert.equal(resolvePackLayer('pack.migration'), 'extend')
        assert.equal(resolvePackLayer('pack.connector.bigdata'), 'extend')
        assert.equal(resolvePackLayer('unknown'), null)
    })

    it('B3-1: suite paywall prefers suite layer framing', () => {
        assert.equal(resolveSuiteLayer('suite.pro'), 'insight')
        assert.equal(resolveSuiteLayer('suite.enterprise'), 'extend')
        assert.equal(
            resolvePaywallLayer({packId: 'pack.backup', suiteId: 'suite.pro'}),
            'insight',
        )
        assert.equal(resolvePaywallLayer({packId: 'pack.ai'}), 'insight')
    })
})
