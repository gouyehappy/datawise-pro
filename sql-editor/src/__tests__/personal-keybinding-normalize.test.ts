import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {normalizeSqlEditorShortcutsLayer} from '../config/snippets/normalize.ts'
import {mergeKeybindingConfigs, loadDefaultKeybindings} from '../editor/shortcut-config.ts'
import {updatePersonalKeybindingKeys} from '../settings/personal-layer-mutations.ts'
import {repairPersonalKeybindingOverrides} from '../settings/personal-storage.ts'

const TOGGLE_AI_BINDING = {
    id: 'toggle_ai',
    command: 'sqlEditor.toggleAi',
    keys: 'Ctrl+Shift+I',
    enabled: true,
}

describe('personal keybinding normalize', () => {
    it('keeps sqlEditor.toggleAi override through normalize', () => {
        const updated = updatePersonalKeybindingKeys({}, TOGGLE_AI_BINDING, 'Ctrl+Shift+K')
        assert.equal(updated.ok, true)

        const normalized = normalizeSqlEditorShortcutsLayer(updated.layer)
        assert.ok(
            normalized.keybindings?.some(
                (item) => item.id === 'toggle_ai' && item.command === 'sqlEditor.toggleAi' && item.keys === 'Ctrl+Shift+K',
            ),
            'custom AI shortcut must survive normalize',
        )
    })

    it('merged keybindings expose customized AI shortcut', () => {
        const updated = updatePersonalKeybindingKeys({}, TOGGLE_AI_BINDING, 'Alt+Shift+A')
        const merged = mergeKeybindingConfigs(
            loadDefaultKeybindings(),
            updated.layer.keybindings,
            updated.layer.disabledKeybindingKeys,
        )
        assert.ok(
            merged.some(
                (item) => item.id === 'toggle_ai' && item.keys === 'Alt+Shift+A' && item.command === 'sqlEditor.toggleAi',
            ),
        )
        assert.ok(
            !merged.some((item) => item.id === 'toggle_ai' && item.keys === 'Ctrl+Shift+I'),
            'old default chord should be disabled after remap',
        )
    })

    it('repairs layer when custom override was stripped but default was disabled', () => {
        const broken = {
            disabledKeybindingKeys: ['toggle_ai|Ctrl+Shift+I'],
            keybindings: [],
        }
        const repaired = repairPersonalKeybindingOverrides(broken)
        assert.deepEqual(repaired.disabledKeybindingKeys, [])
    })
})
