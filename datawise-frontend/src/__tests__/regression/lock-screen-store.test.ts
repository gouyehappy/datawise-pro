import {describe, it, beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {createPinia, setActivePinia} from 'pinia'
import {useLockScreenStore} from '@/features/auth/stores/lock-screen-store'
import {useAuthStore} from '@/features/auth/stores/auth-store'

describe('lock-screen-store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    it('refuses to lock for guest sessions', () => {
        const auth = useAuthStore()
        auth.user = {
            userName: 'guest',
            displayName: 'Guest',
            email: 'guest@datawise.local',
            isGuest: true,
        }
        auth.hasLocalPassword = false

        const lock = useLockScreenStore()
        assert.equal(lock.lock(), false)
        assert.equal(lock.locked, false)
    })

    it('locks when the account has a local password', () => {
        const auth = useAuthStore()
        auth.user = {
            userName: 'admin',
            displayName: 'Admin',
            email: 'admin@datawise.local',
            isGuest: false,
        }
        auth.hasLocalPassword = true

        const lock = useLockScreenStore()
        assert.equal(lock.lock(), true)
        assert.equal(lock.locked, true)
        lock.unlockLocal()
        assert.equal(lock.locked, false)
    })
})
