import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {countReferencePresetConflicts} from '@/features/dashboard/services/dashboard-plugin-preset.service'
import {findPluginPreset} from '@/features/plugin/services/plugin-preset.service'

describe('dashboard-plugin-preset.service', () => {
    it('countReferencePresetConflicts returns zero when all plugins match minimal preset', () => {
        const preset = findPluginPreset('minimal')!
        const conflicts = countReferencePresetConflicts('minimal', (id) => {
            if (preset.enable.includes(id as never)) return true
            if (preset.disable?.includes(id as never)) return false
            return true
        })
        assert.equal(conflicts, 0)
    })

    it('countReferencePresetConflicts counts enabled plugins that minimal would disable', () => {
        const conflicts = countReferencePresetConflicts('minimal', () => true)
        assert.ok(conflicts > 0)
    })
})
