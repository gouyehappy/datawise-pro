import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    createPersonalSqlEditorPersistence,
    persistenceHasShared,
    type SqlEditorShortcutsPersistence,
} from '../settings/persistence.ts'

describe('settings/persistence', () => {
    it('createPersonalSqlEditorPersistence exposes read/write only', () => {
        const p = createPersonalSqlEditorPersistence()
        assert.equal(typeof p.readPersonal, 'function')
        assert.equal(typeof p.writePersonal, 'function')
        assert.equal(p.readShared, undefined)
        assert.equal(p.writeShared, undefined)
        assert.equal(persistenceHasShared(p), false)
    })

    it('persistenceHasShared is true when both shared hooks exist', () => {
        const p: SqlEditorShortcutsPersistence = {
            readPersonal: () => ({}),
            writePersonal: () => {
            },
            readShared: () => ({}),
            writeShared: () => {
            },
        }
        assert.equal(persistenceHasShared(p), true)
    })

    it('persistenceHasShared is false when only one shared hook exists', () => {
        const p: SqlEditorShortcutsPersistence = {
            readPersonal: () => ({}),
            writePersonal: () => {
            },
            readShared: () => ({}),
        }
        assert.equal(persistenceHasShared(p), false)
    })
})
