import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {normalizeEntitlementSnapshot} from '@/features/pack/services/pack-entitlement.normalize'
import {PACK_IDS} from '@/features/pack/types/pack.types'

describe('packsApi normalizeEntitlementSnapshot', () => {
    it('keeps open mode and known packs', () => {
        const snapshot = normalizeEntitlementSnapshot({
            mode: 'open',
            packs: PACK_IDS.map((packId) => ({packId, state: 'active'})),
            suiteId: null,
            freeAiCallsDailyLimit: 3,
        })
        assert.equal(snapshot.mode, 'open')
        assert.equal(snapshot.packs.length, PACK_IDS.length)
        assert.equal(snapshot.freeAiCallsDailyLimit, 3)
    })

    it('filters unknown pack ids and maps enforced mode', () => {
        const snapshot = normalizeEntitlementSnapshot({
            mode: 'enforced',
            packs: [
                {packId: 'pack.ai', state: 'trial', trialDaysLeft: 6},
                {packId: 'pack.unknown', state: 'locked'},
            ],
            suiteId: 'suite.pro',
        })
        assert.equal(snapshot.mode, 'enforced')
        assert.equal(snapshot.suiteId, 'suite.pro')
        assert.equal(snapshot.packs.length, 1)
        assert.equal(snapshot.packs[0]?.packId, 'pack.ai')
        assert.equal(snapshot.packs[0]?.state, 'trial')
        assert.equal(snapshot.packs[0]?.trialDaysLeft, 6)
    })

    it('maps metaDocUsable from dto (defaults open when omitted)', () => {
        const open = normalizeEntitlementSnapshot({
            mode: 'open',
            packs: [],
        })
        assert.equal(open.metaDocUsable, true)

        const enforced = normalizeEntitlementSnapshot({
            mode: 'enforced',
            packs: [],
            metaDocUsable: true,
            suiteId: 'suite.enterprise',
        })
        assert.equal(enforced.metaDocUsable, true)
        assert.equal(enforced.suiteId, 'suite.enterprise')
    })

    it('maps site Pro trial flags', () => {
        const snapshot = normalizeEntitlementSnapshot({
            mode: 'enforced',
            packs: [],
            siteProTrialAvailable: true,
            siteProTrialDays: 14,
        })
        assert.equal(snapshot.siteProTrialAvailable, true)
        assert.equal(snapshot.siteProTrialDays, 14)
    })
})
