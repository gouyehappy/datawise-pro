import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    clearExplorerDatabaseShortcutHandler,
    registerExplorerDatabaseShortcutHandler,
    runExplorerDatabaseShortcut,
} from '@/features/explorer/services/explorer-database-shortcuts.service'

describe('explorer-database-shortcuts.service', () => {
    it('dispatches registered database actions', () => {
        const actions: string[] = []
        registerExplorerDatabaseShortcutHandler((action) => actions.push(action))
        runExplorerDatabaseShortcut('open')
        runExplorerDatabaseShortcut('recent')
        assert.deepEqual(actions, ['open', 'recent'])
        clearExplorerDatabaseShortcutHandler()
    })

    it('no-ops when handler is cleared', () => {
        clearExplorerDatabaseShortcutHandler()
        assert.doesNotThrow(() => runExplorerDatabaseShortcut('console'))
    })
})
