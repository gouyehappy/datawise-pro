import {afterEach, beforeEach, describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    setAppConfigStorageScope,
    syncAppConfigStorageScopeFromSession,
} from '@/shared/config/app-config-storage-scope'
import {persistSession} from '@/shared/auth/session'
import {
    readPinnedExplorerNodeIds,
    writePinnedExplorerNodeIds,
} from '@/features/explorer/services/pinned-explorer-nodes.service'

const PINNED_IDS_KEY = 'datawise-pinned-explorer-nodes'

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

describe('pinned-explorer-nodes.service', () => {
    beforeEach(() => {
        mockLocalStorage()
        persistSession('session-user', 'admin', false, null, 7)
    })

    afterEach(() => {
        localStorage.removeItem(`${PINNED_IDS_KEY}:guest`)
        localStorage.removeItem(`${PINNED_IDS_KEY}:user:7:tenant:default`)
    })

    it('reads pinned ids from the user tenant scope after session restore', () => {
        setAppConfigStorageScope({userId: 7, userName: 'admin', isGuest: false, tenantId: 'default'})
        writePinnedExplorerNodeIds(['db-conn-1:app'])

        // Cold boot before session scope is applied still uses guest namespace.
        setAppConfigStorageScope({isGuest: true})
        assert.deepEqual(readPinnedExplorerNodeIds(), [])

        // Restoring session scope should surface the saved pins again.
        syncAppConfigStorageScopeFromSession({tenantId: 'default'})
        assert.deepEqual(readPinnedExplorerNodeIds(), ['db-conn-1:app'])
    })
})
