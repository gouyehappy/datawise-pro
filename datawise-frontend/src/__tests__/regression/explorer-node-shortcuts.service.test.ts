import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    clearExplorerNodeShortcutHandlers,
    registerExplorerNodeShortcutHandlers,
    runExplorerDeleteSelectedNode,
    runExplorerEditSelectedNode,
    runExplorerOpenSelectedNode,
} from '@/features/explorer/services/explorer-node-shortcuts.service'

describe('explorer-node-shortcuts.service', () => {
    it('dispatches registered handlers', () => {
        let openCalled = false
        let editCalled = false
        let deleteCalled = false

        registerExplorerNodeShortcutHandlers({
            openSelected: () => {
                openCalled = true
            },
            editSelected: () => {
                editCalled = true
            },
            deleteSelected: () => {
                deleteCalled = true
            },
        })

        runExplorerOpenSelectedNode()
        runExplorerEditSelectedNode()
        runExplorerDeleteSelectedNode()

        assert.equal(openCalled, true)
        assert.equal(editCalled, true)
        assert.equal(deleteCalled, true)

        clearExplorerNodeShortcutHandlers()
    })

    it('no-ops when handlers are cleared', () => {
        clearExplorerNodeShortcutHandlers()
        assert.doesNotThrow(() => {
            runExplorerOpenSelectedNode()
            runExplorerEditSelectedNode()
            runExplorerDeleteSelectedNode()
        })
    })
})
