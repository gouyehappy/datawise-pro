import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {DEFAULT_SYNC_DOMAINS} from '@/features/settings/services/config-cloud-sync.service'

describe('config cloud sync defaults (T-SYNC-1)', () => {
    it('defaults to core sync domains without noisy history', () => {
        assert.equal(DEFAULT_SYNC_DOMAINS.connections, true)
        assert.equal(DEFAULT_SYNC_DOMAINS.app, true)
        assert.equal(DEFAULT_SYNC_DOMAINS.snippets, true)
        assert.equal(DEFAULT_SYNC_DOMAINS.savedConsoles, true)
        assert.equal(DEFAULT_SYNC_DOMAINS.sqlHistory, false)
        assert.equal(DEFAULT_SYNC_DOMAINS.aiWorkspace, false)
        assert.equal(DEFAULT_SYNC_DOMAINS.projects, false)
    })
})
