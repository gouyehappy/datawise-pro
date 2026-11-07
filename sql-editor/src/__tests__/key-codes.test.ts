import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {parseKeyChordBits} from '../editor/key-codes.ts'
import {normalizeKeyChord, parseKeyChord} from '../editor/shortcut-config.ts'

describe('editor/key-codes', () => {
    it('parseKeyChordBits parses modifier + letter', () => {
        const bits = parseKeyChordBits('Ctrl+Shift+K')
        assert.ok(bits !== null)
        assert.equal(parseKeyChord('Ctrl+Shift+K'), bits)
    })

    it('normalizeKeyChord canonicalizes aliases', () => {
        assert.equal(normalizeKeyChord('control+shift+k'), 'Ctrl+Shift+K')
    })
})
