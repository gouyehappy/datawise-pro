import assert from 'node:assert/strict'
import test from 'node:test'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {
    readUserResourceJson,
    writeUserResourceJson,
} from '@/features/auth/services/user-scoped-storage.service'
import {setAppConfigStorageScope} from '@/shared/config/app-config-storage-scope'
import {GUEST_KEY, persistSession} from '@/shared/auth/session'

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

test('user-scoped-storage: guest does not persist AiChat', () => {
    mockLocalStorage()
    persistSession('session-guest', 'guest', true)
    setAppConfigStorageScope({isGuest: true})

    const wrote = writeUserResourceJson(UserResource.AiChat, 'dw-cli-ai-chat', {sessions: []})
    assert.equal(wrote, true)
    assert.equal(localStorage.getItem('dw-cli-ai-chat:guest'), null)

    const read = readUserResourceJson(UserResource.AiChat, 'dw-cli-ai-chat', (raw) => raw)
    assert.equal(read, null)
})

test('user-scoped-storage: registered user persists under user scope', () => {
    mockLocalStorage()
    persistSession('session-user', 'admin', false, null, 3)
    setAppConfigStorageScope({userId: 3, userName: 'admin', isGuest: false})
    assert.equal(localStorage.getItem(GUEST_KEY), '0')

    writeUserResourceJson(UserResource.AiChat, 'dw-cli-ai-chat', {sessions: ['a']})
    assert.ok(localStorage.getItem('dw-cli-ai-chat:user:3:tenant:default'))

    const read = readUserResourceJson(UserResource.AiChat, 'dw-cli-ai-chat', (raw) => raw as {sessions: string[]})
    assert.deepEqual(read, {sessions: ['a']})
})
