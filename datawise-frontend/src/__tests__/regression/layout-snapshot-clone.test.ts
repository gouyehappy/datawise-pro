import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {ref, toRaw} from 'vue'

/**
 * Title-bar chrome toggles must snapshot layout without structuredClone(Proxy).
 * Cloning the Vue Proxy throws DataCloneError and aborts the toggle.
 */
describe('layout snapshot clone', () => {
    it('spreads toRaw layout instead of structuredClone on the Proxy', () => {
        const config = ref({
            layout: {
                showSideRailStrip: true,
                showExplorerPanel: true,
                showShortcutRailStrip: false,
                sideRailVisibility: {database: true},
                shortcutRailVisibility: {info: true},
            },
        })
        const preferences = config.value.layout

        assert.throws(() => structuredClone(preferences))

        const layout = toRaw(preferences)
        const snap = {
            ...layout,
            sideRailVisibility: {...toRaw(layout.sideRailVisibility)},
            shortcutRailVisibility: {...toRaw(layout.shortcutRailVisibility)},
        }
        snap.showSideRailStrip = false
        assert.equal(snap.showSideRailStrip, false)
        assert.equal(preferences.showSideRailStrip, true)
        assert.notEqual(snap.sideRailVisibility, preferences.sideRailVisibility)
    })
})
