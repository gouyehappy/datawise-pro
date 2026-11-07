import {describe, it, beforeEach, afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {ApiError} from '../../shared/api/http/request.ts'
import {SESSION_KEY} from '../../shared/auth/session.ts'
import {
    isApiSessionBlocked,
    isQuietAuthFailure,
    isUnauthorizedRecoveryInProgress,
    markApiSessionBlockedForTest,
    maybeRejectBlockedRequest,
    notifyUnauthorizedIfNeeded,
    registerUnauthorizedRecoveryHandler,
    resetUnauthorizedRecoveryState,
    scheduleUnauthorizedRecovery,
    setUnauthorizedRecoveryInProgress,
    shouldRecoverUnauthorizedForRequestSession,
    unblockApiSession,
} from '../../shared/api/http/session-guard.ts'

function installMemoryLocalStorage(): {storage: Map<string, string>; restore: () => void} {
    const storage = new Map<string, string>()
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value)
            },
            removeItem: (key: string) => {
                storage.delete(key)
            },
        },
    })
    return {
        storage,
        restore: () => {
            Object.defineProperty(globalThis, 'localStorage', {
                configurable: true,
                value: original,
            })
        },
    }
}

describe('auth session recovery guard', () => {
    let restoreLocalStorage: (() => void) | null = null

    beforeEach(() => {
        resetUnauthorizedRecoveryState()
        const memory = installMemoryLocalStorage()
        restoreLocalStorage = memory.restore
    })

    afterEach(() => {
        resetUnauthorizedRecoveryState()
        restoreLocalStorage?.()
        restoreLocalStorage = null
    })

    it('blocks subsequent API calls after session is marked invalid', () => {
        markApiSessionBlockedForTest()
        assert.equal(isApiSessionBlocked(), true)
        assert.throws(
            () => maybeRejectBlockedRequest(),
            (error: unknown) => error instanceof ApiError && error.message === 'UNAUTHORIZED',
        )
    })

    it('allows authBypass requests while session is blocked', () => {
        markApiSessionBlockedForTest()
        assert.doesNotThrow(() => maybeRejectBlockedRequest({authBypass: true}))
    })

    it('treats blocked session and UNAUTHORIZED as quiet auth failures', () => {
        assert.equal(isQuietAuthFailure(new ApiError('UNAUTHORIZED')), true)
        assert.equal(isQuietAuthFailure(new ApiError('boom')), false)
        markApiSessionBlockedForTest()
        assert.equal(isQuietAuthFailure(new ApiError('HTTP API request failed')), true)
    })

    it('ignores re-entrant recovery while scoped state reload is in progress', () => {
        setUnauthorizedRecoveryInProgress(true)
        markApiSessionBlockedForTest()
        unblockApiSession()
        assert.equal(isApiSessionBlocked(), false)
        assert.equal(isUnauthorizedRecoveryInProgress(), true)

        // recoveryInProgress 期间再次 401 不得重新 block，否则 resetUserScopedState 会被挡
        scheduleUnauthorizedRecovery()
        assert.equal(isApiSessionBlocked(), false)

        setUnauthorizedRecoveryInProgress(false)
        scheduleUnauthorizedRecovery()
        assert.equal(isApiSessionBlocked(), true)
    })

    it('does not recover when 401 belongs to a rotated-away session id', () => {
        assert.equal(
            shouldRecoverUnauthorizedForRequestSession('session-old', {
                bound: true,
                activeSessionId: 'session-new',
            }),
            false,
        )
        assert.equal(
            shouldRecoverUnauthorizedForRequestSession('session-new', {
                bound: true,
                activeSessionId: 'session-new',
            }),
            true,
        )
        assert.equal(
            shouldRecoverUnauthorizedForRequestSession(null, {
                bound: true,
                activeSessionId: 'session-new',
            }),
            false,
        )
        assert.equal(
            shouldRecoverUnauthorizedForRequestSession(null, {
                bound: true,
                activeSessionId: null,
            }),
            true,
        )
    })

    it('ignores stale UNAUTHORIZED after login replaced the session', () => {
        localStorage.setItem(SESSION_KEY, 'session-after-login')
        let recovered = 0
        registerUnauthorizedRecoveryHandler(() => {
            recovered += 1
        })

        notifyUnauthorizedIfNeeded(new ApiError('UNAUTHORIZED'), {
            requestSessionId: 'session-before-login',
        })
        assert.equal(isApiSessionBlocked(), false)
        assert.equal(recovered, 0)

        notifyUnauthorizedIfNeeded(new ApiError('UNAUTHORIZED'), {
            requestSessionId: 'session-after-login',
        })
        assert.equal(isApiSessionBlocked(), true)
        assert.equal(recovered, 1)
    })
})
