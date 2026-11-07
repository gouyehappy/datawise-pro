import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    formatJsonEditorText,
    isLobTextColumn,
    resolveGridCellEditorKind,
    shouldUseDedicatedCellEditor,
    validateJsonEditorText,
} from '@/features/workspace/services/grid-cell-editor.service'
import type {TableColumn} from '@/core/types'

describe('grid-cell-editor.service', () => {
    const jsonColumn: TableColumn = {name: 'payload', type: 'json'}
    const clobColumn: TableColumn = {name: 'note', type: 'longtext'}
    const blobColumn: TableColumn = {name: 'thumb', type: 'blob'}

    it('detects json and lob columns by type', () => {
        assert.equal(resolveGridCellEditorKind(jsonColumn, []), 'json')
        assert.equal(resolveGridCellEditorKind(clobColumn, []), 'longText')
        assert.equal(resolveGridCellEditorKind(blobColumn, []), 'binary')
    })

    it('recognizes mediumtext/longtext as lob text columns', () => {
        assert.equal(isLobTextColumn({name: 'note', type: 'longtext'}), true)
        assert.equal(isLobTextColumn({name: 'desc', type: 'mediumtext'}), true)
        assert.equal(isLobTextColumn({name: 'body', type: 'text'}), false)
        assert.equal(isLobTextColumn({name: 'id', type: 'varchar'}), false)
    })

    it('detects json content heuristically', () => {
        assert.equal(
            resolveGridCellEditorKind({name: 'meta', type: 'varchar'}, [], '{"a":1}'),
            'json',
        )
    })

    it('flags dedicated editors for lob/json/binary', () => {
        assert.equal(shouldUseDedicatedCellEditor(clobColumn, []), true)
        assert.equal(shouldUseDedicatedCellEditor({name: 'id', type: 'int'}, []), false)
    })

    it('validates and formats json editor text', () => {
        assert.equal(validateJsonEditorText('{"a":1}'), null)
        assert.equal(validateJsonEditorText('{bad'), 'invalidJson')
        assert.match(formatJsonEditorText('{"a":1}'), /"a": 1/)
    })
})
