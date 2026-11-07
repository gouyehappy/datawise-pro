import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildPresetPluginOverrides,
    countPluginsConflictingWithPreset,
    findPluginPreset,
    listPresetChanges,
    mergePresetIntoOverrides,
    normalizeReferencePresetId,
    pluginConflictsWithPreset,
    recommendClosestPreset,
    suggestPresetForTeamRole,
    summarizePresetImpact,
} from '@/features/plugin/services/plugin-preset.service'

describe('plugin-preset.service', () => {
    it('buildPresetPluginOverrides sets enable and disable flags', () => {
        const preset = findPluginPreset('readOnlyAnalysis')
        assert.ok(preset)
        const overrides = buildPresetPluginOverrides(preset!)
        assert.equal(overrides['p-result-diff'], true)
        assert.equal(overrides['p-fake-data'], false)
        assert.equal(overrides['p-migration-tasks'], false)
    })

    it('mergePresetIntoOverrides preserves unrelated overrides', () => {
        const preset = findPluginPreset('dba')
        assert.ok(preset)
        const merged = mergePresetIntoOverrides({'p-grid-export': false}, preset!)
        assert.equal(merged['p-grid-export'], false)
        assert.equal(merged['p-sql-monitor'], true)
        assert.equal(merged['p-fake-data'], false)
    })

    it('teamViewer preset disables write-heavy AI plugins', () => {
        const preset = findPluginPreset('teamViewer')
        assert.ok(preset)
        const overrides = buildPresetPluginOverrides(preset!)
        assert.equal(overrides['p-ai-result-summary'], true)
        assert.equal(overrides['p-ai-sql-fix'], false)
        assert.equal(overrides['p-ai-index-suggest'], false)
        assert.equal(overrides['p-grid-edit'], false)
    })

    it('suggestPresetForTeamRole returns teamViewer for viewer role', () => {
        assert.equal(suggestPresetForTeamRole('viewer'), 'teamViewer')
        assert.equal(suggestPresetForTeamRole('admin'), null)
    })

    it('minimal preset disables AI and write-heavy plugins', () => {
        const preset = findPluginPreset('minimal')
        assert.ok(preset)
        const overrides = buildPresetPluginOverrides(preset!)
        assert.equal(overrides['p-sql-format'], true)
        assert.equal(overrides['p-ai-workbench'], false)
        assert.equal(overrides['p-grid-edit'], false)
    })

    it('developer preset enables AI and editing tooling', () => {
        const preset = findPluginPreset('developer')
        assert.ok(preset)
        const overrides = buildPresetPluginOverrides(preset!)
        assert.equal(overrides['p-ai-workbench'], true)
        assert.equal(overrides['p-grid-edit'], true)
        assert.equal(overrides['p-fake-data'], true)
    })

    it('summarizePresetImpact lists only plugins that would change', () => {
        const preset = findPluginPreset('minimal')
        assert.ok(preset)
        const impact = summarizePresetImpact(preset!, () => true)
        assert.equal(impact.toEnable.length, 0)
        assert.ok(impact.toDisable.includes('p-ai-workbench'))
        assert.ok(impact.totalChanges > 0)
        const changes = listPresetChanges(preset!, () => true)
        assert.equal(changes.length, impact.totalChanges)
    })

    it('pluginConflictsWithPreset detects mismatch on touched plugins only', () => {
        const preset = findPluginPreset('minimal')
        assert.ok(preset)
        assert.equal(pluginConflictsWithPreset('p-ai-workbench', preset!, () => true), true)
        assert.equal(pluginConflictsWithPreset('p-ai-workbench', preset!, () => false), false)
        assert.equal(pluginConflictsWithPreset('p-sql-history', preset!, () => true), false)
        assert.equal(countPluginsConflictingWithPreset(preset!, () => true), preset!.disable!.length)
    })

    it('recommendClosestPreset picks zero-conflict preset when all plugins enabled', () => {
        const match = recommendClosestPreset(() => true)
        assert.ok(match)
        assert.equal(match!.conflicts, 0)
        assert.equal(match!.id, 'developer')
    })

    it('normalizeReferencePresetId falls back to minimal', () => {
        assert.equal(normalizeReferencePresetId('dba'), 'dba')
        assert.equal(normalizeReferencePresetId('invalid'), 'minimal')
        assert.equal(normalizeReferencePresetId(undefined), 'minimal')
    })
})
