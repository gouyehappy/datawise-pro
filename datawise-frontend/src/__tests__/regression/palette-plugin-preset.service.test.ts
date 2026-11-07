import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {buildPluginPalettePresetCommands, buildPluginPaletteReferencePresetCommands, buildPluginPaletteAlignReferenceCommand, buildPluginPaletteOpenPresetDiffCommand} from '@/features/layout/services/palette-plugin-preset.service'
import {PLUGIN_PRESET_IDS} from '@/features/plugin/services/plugin-preset.service'

describe('palette-plugin-preset.service', () => {
    it('buildPluginPalettePresetCommands emits one command per preset id', () => {
        const applied: string[] = []
        const commands = buildPluginPalettePresetCommands({
            group: 'Presets',
            presetLabel: (presetId) => `Apply ${presetId}`,
            applyPreset: (presetId) => {
                applied.push(presetId)
            },
        })
        assert.equal(commands.length, PLUGIN_PRESET_IDS.length)
        for (const presetId of PLUGIN_PRESET_IDS) {
            assert.ok(commands.some((item) => item.id === `plugin:preset:${presetId}`))
        }
        commands[0]?.run()
        assert.equal(applied.length, 1)
    })

    it('includes impact hint when preset would change enabled plugins', () => {
        const commands = buildPluginPalettePresetCommands({
            group: 'Presets',
            presetLabel: (presetId) => presetId,
            applyPreset: () => undefined,
        }, {
            isEnabled: () => false,
        })
        const minimal = commands.find((item) => item.id === 'plugin:preset:minimal')
        assert.ok(minimal?.hint?.includes('+'))
    })

    it('merges custom preset hint with impact hint', () => {
        const commands = buildPluginPalettePresetCommands({
            group: 'Presets',
            presetLabel: (presetId) => presetId,
            presetHint: () => 'reference',
            applyPreset: () => undefined,
        }, {
            isEnabled: () => false,
        })
        const minimal = commands.find((item) => item.id === 'plugin:preset:minimal')
        assert.ok(minimal?.hint?.includes('reference'))
        assert.ok(minimal?.hint?.includes('+'))
    })

    it('buildPluginPaletteReferencePresetCommands emits set-reference command per preset', () => {
        const set: string[] = []
        const commands = buildPluginPaletteReferencePresetCommands({
            group: 'Reference',
            referenceLabel: (presetId) => `Ref ${presetId}`,
            setReferencePreset: (presetId) => {
                set.push(presetId)
            },
        })
        assert.equal(commands.length, PLUGIN_PRESET_IDS.length)
        assert.ok(commands.some((item) => item.id === 'plugin:reference-preset:developer'))
        commands.find((item) => item.id === 'plugin:reference-preset:dba')?.run()
        assert.deepEqual(set, ['dba'])
    })

    it('buildPluginPaletteAlignReferenceCommand invokes align handler', () => {
        let aligned = false
        const command = buildPluginPaletteAlignReferenceCommand({
            group: 'Reference',
            label: 'Align',
            hint: '3 to align',
            alignToReferencePreset: () => {
                aligned = true
            },
        })
        assert.equal(command.id, 'plugin:align-reference-preset')
        assert.equal(command.hint, '3 to align')
        command.run()
        assert.equal(aligned, true)
    })

    it('buildPluginPaletteOpenPresetDiffCommand invokes open handler', () => {
        let opened = false
        const command = buildPluginPaletteOpenPresetDiffCommand({
            group: 'Reference',
            label: 'Open preset diff',
            openPresetDiff: () => {
                opened = true
            },
        })
        assert.equal(command.id, 'plugin:open-preset-diff')
        command.run()
        assert.equal(opened, true)
    })
})
