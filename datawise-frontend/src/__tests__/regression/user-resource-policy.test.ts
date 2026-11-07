import assert from 'node:assert/strict'
import test from 'node:test'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {
    canPersistLocalResource,
    canReadResource,
    canWriteResource,
} from '@/features/auth/services/user-resource-policy'
import {setAppConfigStorageScope} from '@/shared/config/app-config-storage-scope'
import {GUEST_KEY, persistSession, USER_ID_KEY} from '@/shared/auth/session'

function mockLocalStorage(): void {
    const store = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => store.set(key, value),
            removeItem: (key: string) => store.delete(key),
        },
    })
}

test('UserResourcePolicy: guest can write connection catalog only', () => {
    mockLocalStorage()
    persistSession('session-guest', 'guest', true)
    setAppConfigStorageScope({isGuest: true})
    assert.equal(canReadResource(UserResource.ConnectionCatalog), true)
    assert.equal(canWriteResource(UserResource.ConnectionCatalog), true)
    assert.equal(canReadResource(UserResource.AppConfig), false)
    assert.equal(canReadResource(UserResource.AiPreferences), false)
    assert.equal(canWriteResource(UserResource.AppConfig), false)
    assert.equal(canPersistLocalResource(UserResource.AppConfig), false)
})

test('UserResourcePolicy: registered user can persist user-scoped resources', () => {
    mockLocalStorage()
    persistSession('session-user', 'admin', false, null, 7)
    setAppConfigStorageScope({userId: 7, userName: 'admin', isGuest: false})
    assert.equal(localStorage.getItem(GUEST_KEY), '0')
    assert.equal(localStorage.getItem(USER_ID_KEY), '7')
    assert.equal(canWriteResource(UserResource.AppConfig), true)
    assert.equal(canPersistLocalResource(UserResource.AiChat), true)
    assert.equal(canWriteResource(UserResource.AiKnowledge), true)
})
