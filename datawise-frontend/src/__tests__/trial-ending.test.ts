import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {listEndingTrials, TRIAL_ENDING_DAYS_THRESHOLD} from '@/features/pack/services/trial-ending'

describe('trial-ending', () => {
    it('lists trial packs within the threshold, soonest first', () => {
        const ending = listEndingTrials([
            {id: 'pack.ai', state: 'trial', trialDaysLeft: 3},
            {id: 'pack.backup', state: 'active', trialDaysLeft: 1},
            {id: 'pack.migration', state: 'trial', trialDaysLeft: 1},
            {id: 'pack.governance', state: 'trial', trialDaysLeft: 7},
            {id: 'pack.security', state: 'locked', trialDaysLeft: null},
        ])
        assert.deepEqual(ending, [
            {packId: 'pack.migration', trialDaysLeft: 1},
            {packId: 'pack.ai', trialDaysLeft: 3},
        ])
        assert.equal(TRIAL_ENDING_DAYS_THRESHOLD, 3)
    })

    it('includes day-zero trials', () => {
        const ending = listEndingTrials([{id: 'pack.ai', state: 'trial', trialDaysLeft: 0}])
        assert.equal(ending.length, 1)
        assert.equal(ending[0].trialDaysLeft, 0)
    })
})
