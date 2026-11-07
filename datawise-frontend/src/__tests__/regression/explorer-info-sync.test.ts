import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {EXPLORER_INFO_SYNC_DELAY_MS} from '@/features/explorer/constants/explorer-info-sync'

describe('explorer-info-sync', () => {
    it('keeps the info-panel debounce delay stable', () => {
        assert.equal(EXPLORER_INFO_SYNC_DELAY_MS, 280)
    })
})
