import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    isTerminalTabKey,
    terminalTabPayload,
} from '@/features/terminal/services/terminal-tab-keys'

describe('terminal-tab-keys', () => {
    it('treats plain Tab / Shift+Tab as terminal tab keys', () => {
        assert.equal(isTerminalTabKey({key: 'Tab', ctrlKey: false, metaKey: false, altKey: false}), true)
        assert.equal(isTerminalTabKey({key: 'Tab', ctrlKey: true, metaKey: false, altKey: false}), false)
        assert.equal(isTerminalTabKey({key: 'a', ctrlKey: false, metaKey: false, altKey: false}), false)
    })

    it('maps Shift+Tab to CSI Z like xterm', () => {
        assert.equal(terminalTabPayload(false), '\t')
        assert.equal(terminalTabPayload(true), '\x1b[Z')
    })
})
