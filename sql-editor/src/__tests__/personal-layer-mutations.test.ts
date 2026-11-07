import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    patchPersonalSqlEditorLayer,
    removePersonalLayerSnippet,
    setPersonalQuickChipEnabled,
    updatePersonalKeybindingKeys,
    upsertPersonalLayerSnippet,
} from '../settings/personal-layer-mutations.ts'

const SAMPLE_BINDING = {
    id: 'format',
    command: 'editor.action.formatDocument',
    keys: 'Shift+Alt+F',
    enabled: true,
}

describe('settings/personal-layer-mutations', () => {
    it('patchPersonalSqlEditorLayer merges behavior flags', () => {
        const next = patchPersonalSqlEditorLayer({}, {autoTableAlias: false, fontSize: 18})
        assert.equal(next.autoTableAlias, false)
        assert.equal(next.fontSize, 18)
    })

    it('setPersonalQuickChipEnabled toggles disabledQuickChipIds', () => {
        const disabled = setPersonalQuickChipEnabled({}, 'chip-where-eq', false)
        assert.deepEqual(disabled.disabledQuickChipIds, ['chip-where-eq'])
        const enabled = setPersonalQuickChipEnabled(disabled, 'chip-where-eq', true)
        assert.deepEqual(enabled.disabledQuickChipIds, [])
    })

    it('upsertPersonalLayerSnippet creates and updates snippet', () => {
        const created = upsertPersonalLayerSnippet({}, 's1', {
            label: 'w',
            insertText: 'WHERE 1=1',
            slots: ['where'],
        })
        assert.equal(created.snippets?.length, 1)
        assert.equal(created.snippets?.[0]?.label, 'w')

        const updated = upsertPersonalLayerSnippet(created, 's1', {detail: 'filter'})
        assert.equal(updated.snippets?.[0]?.detail, 'filter')
    })

    it('removePersonalLayerSnippet returns null when missing', () => {
        assert.equal(removePersonalLayerSnippet({}, 'missing'), null)
    })

    it('updatePersonalKeybindingKeys rejects invalid chord', () => {
        const result = updatePersonalKeybindingKeys({}, SAMPLE_BINDING, 'not-a-chord!!!')
        assert.equal(result.ok, false)
    })

    it('updatePersonalKeybindingKeys accepts valid chord override', () => {
        const result = updatePersonalKeybindingKeys({}, SAMPLE_BINDING, 'Ctrl+Shift+K')
        assert.equal(result.ok, true)
        assert.ok(result.layer.keybindings?.some((item) => item.keys === 'Ctrl+Shift+K'))
    })
})
