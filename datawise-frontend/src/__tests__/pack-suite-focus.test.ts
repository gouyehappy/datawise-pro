import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    isSuitePaywallContext,
    resolveSuitePaywallTarget,
    suitePackUsableChecker,
    suiteProgress,
} from '@/features/pack/services/pack-suite-focus'
import {SUITE_CATALOG} from '@/features/pack/catalog/pack-catalog'
import type {PackId} from '@/features/pack/types/pack.types'

describe('pack-suite-focus', () => {
    it('reports complete when every pack is usable', () => {
        const suite = SUITE_CATALOG[0]!
        const progress = suiteProgress(suite, () => true)
        assert.equal(progress.complete, true)
        assert.equal(progress.unlocked, suite.packIds.length)
        assert.equal(progress.locked.length, 0)
    })

    it('lists locked packs and targets the first for paywall', () => {
        const usable = new Set<PackId>(['pack.ai'])
        const target = resolveSuitePaywallTarget('suite.pro', (id) => usable.has(id))
        assert.deepEqual(target, {
            kind: 'paywall',
            suiteId: 'suite.pro',
            packId: 'pack.governance',
            context: 'suite.pro',
        })
    })

    it('returns complete when suite already unlocked', () => {
        const target = resolveSuitePaywallTarget('suite.enterprise', () => true)
        assert.deepEqual(target, {kind: 'complete', suiteId: 'suite.enterprise'})
    })

    it('open-mode checker treats every pack as locked for suite upsell', () => {
        const checker = suitePackUsableChecker('open', () => true)
        assert.equal(checker('pack.ai'), false)
        const progress = suiteProgress(SUITE_CATALOG[0]!, checker)
        assert.equal(progress.complete, false)
        assert.equal(progress.unlocked, 0)
        const target = resolveSuitePaywallTarget('suite.pro', checker)
        assert.equal(target?.kind, 'paywall')
    })

    it('enforced-mode checker delegates to isPackUsable', () => {
        const usable = new Set<PackId>(['pack.ai', 'pack.governance'])
        const checker = suitePackUsableChecker('enforced', (id) => usable.has(id))
        assert.equal(checker('pack.ai'), true)
        assert.equal(resolveSuitePaywallTarget('suite.pro', checker)?.kind, 'complete')
    })

    it('recognizes suite paywall contexts', () => {
        assert.equal(isSuitePaywallContext('suite.pro'), true)
        assert.equal(isSuitePaywallContext('suite'), false)
        assert.equal(isSuitePaywallContext('store'), false)
    })
})
