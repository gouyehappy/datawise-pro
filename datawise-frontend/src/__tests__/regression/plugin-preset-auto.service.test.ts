import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    markPresetAutoApplied,
    readAutoAppliedPresets,
    resolveFirstVisitAutoPreset,
} from '@/features/plugin/services/plugin-preset-auto.service'
import {hasPluginEnabledOverrides} from '@/features/plugin/services/plugin-preset.service'

describe('plugin-preset-auto.service', () => {
    it('hasPluginEnabledOverrides detects boolean entries', () => {
        assert.equal(hasPluginEnabledOverrides({}), false)
        assert.equal(hasPluginEnabledOverrides({'p-grid-export': true}), true)
    })

    it('resolveFirstVisitAutoPreset skips when overrides exist', () => {
        assert.equal(resolveFirstVisitAutoPreset('viewer', {}), 'teamViewer')
        assert.equal(resolveFirstVisitAutoPreset('viewer', {'p-grid-export': false}), null)
        assert.equal(resolveFirstVisitAutoPreset('admin', {}), null)
    })

    it('markPresetAutoApplied prevents repeat auto apply', () => {
        markPresetAutoApplied('teamViewer')
        assert.ok(readAutoAppliedPresets().includes('teamViewer'))
        assert.equal(resolveFirstVisitAutoPreset('viewer', {}), null)
    })
})
