import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {DEFAULT_LAYOUT_PREFERENCES} from '@/shared/config/app-config.defaults'
import {
    HOME_NAV_MODULE,
    pickAccessibleNavModule,
    resolveHomeNavModule,
} from '@/shared/config/home-nav.module'

describe('home nav module (workbench as system home)', () => {
    it('maps persisted dashboard lastModule to database', () => {
        assert.equal(resolveHomeNavModule('dashboard'), 'database')
        assert.equal(resolveHomeNavModule('ai'), 'ai')
        assert.equal(HOME_NAV_MODULE, 'database')
    })

    it('normalizes layout config lastModule from dashboard to database', () => {
        const lastModule = resolveHomeNavModule('dashboard')
        assert.equal(lastModule, 'database')
    })

    it('pickAccessibleNavModule prefers database over dashboard in saved lastModule', () => {
        const prefs = {...DEFAULT_LAYOUT_PREFERENCES, lastModule: 'dashboard'}
        const module = pickAccessibleNavModule(prefs, () => true)
        assert.equal(module, 'database')
    })

    it('pickAccessibleNavModule still restores ai when lastModule is ai', () => {
        const prefs = {...DEFAULT_LAYOUT_PREFERENCES, lastModule: 'ai'}
        const module = pickAccessibleNavModule(prefs, () => true)
        assert.equal(module, 'ai')
    })

    it('pickAccessibleNavModule falls back to database when nothing else is accessible', () => {
        const prefs = {...DEFAULT_LAYOUT_PREFERENCES}
        const module = pickAccessibleNavModule(prefs, (id) => id === 'database')
        assert.equal(module, 'database')
    })
})
