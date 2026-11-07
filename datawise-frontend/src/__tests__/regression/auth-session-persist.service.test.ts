import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    EXPIRES_AT_KEY,
    isLocalSessionExpired,
    persistSession,
    readSessionExpiresAt,
    SESSION_KEY,
} from '../../shared/auth/session.ts'

describe('auth session storage', () => {
    it('persistSession stores session id and expiry', () => {
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

        try {
            persistSession('session-abc', 'admin', false, 1_700_000_000_000)
            assert.equal(storage.get(SESSION_KEY), 'session-abc')
            assert.equal(readSessionExpiresAt(), 1_700_000_000_000)
            assert.equal(storage.get(EXPIRES_AT_KEY), '1700000000000')
            assert.equal(isLocalSessionExpired(1_700_000_000_001), true)
            assert.equal(isLocalSessionExpired(1_699_999_999_999), false)
        } finally {
            Object.defineProperty(globalThis, 'localStorage', {
                configurable: true,
                value: original,
            })
        }
    })
})
