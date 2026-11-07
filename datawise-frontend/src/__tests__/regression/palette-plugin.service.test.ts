import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {PluginItem} from '@/core/types'
import {
    buildPluginPaletteCommands,
    buildPluginPaletteStaticCommands,
    shouldShowPluginPaletteCommands,
    sortPluginsForCommandPalette,
} from '@/features/layout/services/palette-plugin.service'

describe('palette-plugin.service', () => {
    const plugins: PluginItem[] = [
        {
            id: 'p-z-last',
            name: 'Z Last',
            version: '1.0.0',
            author: 'DataWise',
            description: 'z',
            enabled: true,
            category: 'tool',
        },
        {
            id: 'p-a-first',
            name: 'A First',
            version: '1.0.0',
            author: 'DataWise',
            description: 'a',
            enabled: false,
            category: 'tool',
        },
    ]

    it('shouldShowPluginPaletteCommands requires non-empty query', () => {
        assert.equal(shouldShowPluginPaletteCommands(''), false)
        assert.equal(shouldShowPluginPaletteCommands('  '), false)
        assert.equal(shouldShowPluginPaletteCommands('grid'), true)
    })

    it('sortPluginsForCommandPalette keeps stable name order when usage ties', () => {
        const sorted = sortPluginsForCommandPalette(plugins)
        assert.deepEqual(sorted.map((item) => item.id), ['p-a-first', 'p-z-last'])
    })

    it('buildPluginPaletteCommands emits focus and toggle entries', () => {
        const commands = buildPluginPaletteCommands(plugins, {
            group: 'Plugins',
            nameOf: (plugin) => plugin.name,
            enabledText: 'on',
            disabledText: 'off',
            focusLabel: (name) => `Focus ${name}`,
            enableLabel: (name) => `Enable ${name}`,
            disableLabel: (name) => `Disable ${name}`,
            focusPlugin: () => undefined,
            setEnabled: () => undefined,
        })
        assert.equal(commands.length, 4)
        assert.ok(commands.some((item) => item.id === 'plugin:focus:p-a-first'))
        assert.ok(commands.some((item) => item.id === 'plugin:toggle-on:p-a-first'))
        assert.ok(commands.some((item) => item.id === 'plugin:toggle-off:p-z-last'))
    })

    it('buildPluginPaletteStaticCommands emits open settings when handler provided', () => {
        let opened = false
        const commands = buildPluginPaletteStaticCommands({
            group: 'Plugins',
            pluginSettingsLabel: 'Open plugin settings',
            openPluginSettings: () => {
                opened = true
            },
        })
        assert.equal(commands.length, 1)
        assert.equal(commands[0]?.id, 'plugin:open-settings')
        commands[0]?.run()
        assert.equal(opened, true)
    })

    it('buildPluginPaletteStaticCommands returns empty when handler omitted', () => {
        assert.deepEqual(buildPluginPaletteStaticCommands({group: 'Plugins'}), [])
    })
})
