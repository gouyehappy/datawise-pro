import {afterEach, beforeEach, describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {setAppConfigStorageScope} from '@/shared/config/app-config-storage-scope'
import {persistSession} from '@/shared/auth/session'
import {
    readPinnedTableFavorites,
    removePinnedTableFavorite,
    upsertPinnedTableFavorite,
} from '@/features/explorer/services/pinned-table-favorites.service'
import {
    readPinnedExplorerNodeIds,
    writePinnedExplorerNodeIds,
} from '@/features/explorer/services/pinned-explorer-nodes.service'

const METADATA_KEY = 'datawise-pinned-table-favorites'
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

describe('pinned-table-favorites.service', () => {
    beforeEach(() => {
        mockLocalStorage()
        persistSession('session-user', 'admin', false, null, 7)
        setAppConfigStorageScope({userId: 7, userName: 'admin', isGuest: false})
    })

    afterEach(() => {
        localStorage.removeItem(METADATA_KEY)
        localStorage.removeItem(PINNED_IDS_KEY)
    })

    it('lists favorites only for pinned table ids with metadata', () => {
        writePinnedExplorerNodeIds(['tbl-1', 'conn-1'])
        upsertPinnedTableFavorite({
            nodeId: 'tbl-1',
            connectionId: 'conn-1',
            database: 'app',
            tableName: 'users',
            connectionLabel: 'Local MySQL',
        })

        const favorites = readPinnedTableFavorites()
        assert.equal(favorites.length, 1)
        assert.equal(favorites[0]?.tableName, 'users')
    })

    it('drops metadata when unpinned even if metadata still exists in storage', () => {
        writePinnedExplorerNodeIds(['tbl-1'])
        upsertPinnedTableFavorite({
            nodeId: 'tbl-1',
            connectionId: 'conn-1',
            database: 'app',
            tableName: 'users',
        })

        writePinnedExplorerNodeIds([])
        assert.equal(readPinnedTableFavorites().length, 0)
    })

    it('removePinnedTableFavorite clears the table from favorites list', () => {
        writePinnedExplorerNodeIds(['tbl-1'])
        upsertPinnedTableFavorite({
            nodeId: 'tbl-1',
            connectionId: 'conn-1',
            database: 'app',
            tableName: 'users',
        })

        removePinnedTableFavorite('tbl-1')
        writePinnedExplorerNodeIds(readPinnedExplorerNodeIds().filter((id) => id !== 'tbl-1'))

        assert.equal(readPinnedTableFavorites().length, 0)
    })
})
