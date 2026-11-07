import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    isPaletteCommandMode,
    paletteCommandQuery,
    searchPaletteCommands,
} from '@/features/layout/services/palette-command.service'

describe('palette-command.service', () => {
    it('detects command mode prefix', () => {
        assert.equal(isPaletteCommandMode('> run'), true)
        assert.equal(isPaletteCommandMode('table'), false)
    })

    it('strips command prefix', () => {
        assert.equal(paletteCommandQuery('>  new console'), 'new console')
    })

    it('filters commands by label', () => {
        const results = searchPaletteCommands('terminal', (key) =>
            key.includes('terminal') ? 'Toggle terminal' : key,
        )
        assert.equal(results.some((item) => item.id === 'app.toggleTerminal'), true)
    })
})
