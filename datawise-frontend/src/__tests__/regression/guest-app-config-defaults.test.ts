import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {shouldUseBuiltinAppConfig} from '@/shared/config/app-config-read-policy'
import {setAppConfigStorageScope} from '@/shared/config/app-config-storage-scope'
import {GUEST_KEY, persistSession, SESSION_KEY} from '@/shared/auth/session'

describe('guest app config read policy', () => {
    it('uses builtin defaults for guest and pre-login sessions', () => {
        persistSession('session-guest', 'guest', true)
        setAppConfigStorageScope({isGuest: true})
        assert.equal(shouldUseBuiltinAppConfig(), true)

        localStorage.removeItem(SESSION_KEY)
        localStorage.removeItem(GUEST_KEY)
        setAppConfigStorageScope({isGuest: false})
        assert.equal(shouldUseBuiltinAppConfig(), true)

        persistSession('session-user', 'admin', false, null, 7)
        setAppConfigStorageScope({userId: 7, userName: 'admin', isGuest: false})
        assert.equal(shouldUseBuiltinAppConfig(), false)
    })
})
