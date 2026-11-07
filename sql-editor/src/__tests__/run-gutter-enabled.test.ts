import assert from 'node:assert/strict'
import test from 'node:test'
import {patchPersonalSqlEditorLayer} from '@sql-editor/settings/personal-layer-mutations'
import {isSqlRunGutterEnabled} from '@sql-editor/editor/run-gutter-enabled'

test('isSqlRunGutterEnabled defaults to true when personal layer omits the flag', () => {
    assert.equal(isSqlRunGutterEnabled(), true)
})

test('patchPersonalSqlEditorLayer persists showRunGutterButton', () => {
    const layer = patchPersonalSqlEditorLayer({}, {showRunGutterButton: true})
    assert.equal(layer.showRunGutterButton, true)
    const off = patchPersonalSqlEditorLayer(layer, {showRunGutterButton: false})
    assert.equal(off.showRunGutterButton, false)
})
