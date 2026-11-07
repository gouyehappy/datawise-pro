import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {shouldClearLoginAfterSessionProbe} from '../../features/auth/services/auth-session-recovery.service.ts'

describe('auth session probe before forced login', () => {
    it('keeps a registered login when the session probe still succeeds', () => {
        assert.equal(shouldClearLoginAfterSessionProbe(false, 'valid'), false)
    })

    it('keeps a registered login when the probe fails for non-auth reasons', () => {
        assert.equal(shouldClearLoginAfterSessionProbe(false, 'unknown'), false)
    })

    it('clears a registered login only when /api/auth/session confirms UNAUTHORIZED', () => {
        assert.equal(shouldClearLoginAfterSessionProbe(false, 'unauthorized'), true)
    })

    it('always allows guest recovery to proceed', () => {
        assert.equal(shouldClearLoginAfterSessionProbe(true, 'valid'), true)
        assert.equal(shouldClearLoginAfterSessionProbe(true, 'unknown'), true)
        assert.equal(shouldClearLoginAfterSessionProbe(true, 'unauthorized'), true)
    })
})
