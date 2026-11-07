import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    isTerminalSuspendKey,
    resolveSshTerminalKeyAction,
    terminalSuspendPayload,
} from '@/features/terminal/services/ssh-terminal-keys'

const clipOk = {hasSelection: true, canWriteClipboard: true, canReadClipboard: true}
const noSel = {hasSelection: false, canWriteClipboard: true, canReadClipboard: true}

describe('resolveSshTerminalKeyAction', () => {
    it('lets bare Ctrl+C reach PTY when there is no selection', () => {
        const action = resolveSshTerminalKeyAction(
            {type: 'keydown', key: 'c', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false},
            noSel,
        )
        assert.equal(action.type, 'pass')
    })

    it('copies on Ctrl+C when selection exists', () => {
        const action = resolveSshTerminalKeyAction(
            {type: 'keydown', key: 'c', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false},
            clipOk,
        )
        assert.equal(action.type, 'copy')
    })

    it('uses Ctrl+Shift+V for paste without blocking interrupt', () => {
        const action = resolveSshTerminalKeyAction(
            {type: 'keydown', key: 'v', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true},
            clipOk,
        )
        assert.equal(action.type, 'paste')
    })

    it('prevents Tab focus escape', () => {
        const action = resolveSshTerminalKeyAction(
            {type: 'keydown', key: 'Tab', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false},
            noSel,
        )
        assert.equal(action.type, 'prevent-and-pass')
    })

    it('maps bare Ctrl+Z to PTY suspend (^Z / SIGTSTP)', () => {
        const action = resolveSshTerminalKeyAction(
            {type: 'keydown', key: 'z', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false},
            noSel,
        )
        assert.equal(action.type, 'suspend')
    })

    it('does not treat Cmd+Z as suspend (macOS Undo)', () => {
        const action = resolveSshTerminalKeyAction(
            {type: 'keydown', key: 'z', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false},
            noSel,
        )
        assert.equal(action.type, 'pass')
    })
})

describe('terminalSuspendPayload', () => {
    it('is ASCII SUB (0x1a)', () => {
        assert.equal(terminalSuspendPayload(), '\x1a')
        assert.equal(terminalSuspendPayload().charCodeAt(0), 26)
    })

    it('detects bare Ctrl+Z only', () => {
        assert.equal(
            isTerminalSuspendKey({key: 'z', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false}),
            true,
        )
        assert.equal(
            isTerminalSuspendKey({key: 'z', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true}),
            false,
        )
    })
})
