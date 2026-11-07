import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {SHORTCUT_DEFINITIONS} from '@/core/shortcuts/definitions'
import {
    EDITABLE_TARGET_GLOBAL_SHORTCUT_IDS,
    GLOBAL_SHORTCUT_ACTION_IDS,
    isLocalShortcutId,
    LOCAL_SQL_EDITOR_SHORTCUT_IDS,
} from '@/core/shortcuts/scope'
import {
    clearPageLocalShortcuts,
    getActivePageLocalShortcutOwner,
    invokeLocalShortcut,
    setPageLocalShortcuts,
} from '@/core/shortcuts/local-shortcut-registry'

describe('shortcut scope', () => {
    it('marks sql editor actions as local-only', () => {
        for (const id of LOCAL_SQL_EDITOR_SHORTCUT_IDS) {
            assert.equal(isLocalShortcutId(id), true)
            const def = SHORTCUT_DEFINITIONS.find((item) => item.id === id)
            assert.equal(def?.scope, 'local')
        }
    })

    it('keeps run/save/ai out of global and editable-global lists', () => {
        for (const id of LOCAL_SQL_EDITOR_SHORTCUT_IDS) {
            assert.equal(GLOBAL_SHORTCUT_ACTION_IDS.includes(id), false)
            assert.equal(EDITABLE_TARGET_GLOBAL_SHORTCUT_IDS.includes(id), false)
        }
    })

    it('invokes local handlers only for the active page owner', () => {
        let consoleSave = false
        setPageLocalShortcuts('console-a', {
            actionHandlers: {
                'workspace.saveConsole': () => {
                    consoleSave = true
                },
            },
            keyHandlers: new Map(),
        })
        assert.equal(getActivePageLocalShortcutOwner(), 'console-a')
        assert.equal(invokeLocalShortcut('workspace.saveConsole'), true)
        assert.equal(consoleSave, true)

        clearPageLocalShortcuts('console-a')
        assert.equal(getActivePageLocalShortcutOwner(), null)
        assert.equal(invokeLocalShortcut('workspace.saveConsole'), false)
    })

    it('does not clear another page owner handlers', () => {
        setPageLocalShortcuts('console-a', {
            actionHandlers: {},
            keyHandlers: new Map(),
        })
        clearPageLocalShortcuts('console-b')
        assert.equal(getActivePageLocalShortcutOwner(), 'console-a')
        clearPageLocalShortcuts('console-a')
    })
})
