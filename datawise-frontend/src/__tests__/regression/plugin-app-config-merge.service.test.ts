import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {mergePluginsOnAppConfigImport} from '@/features/plugin/services/plugin-app-config-merge.service'

describe('plugin-app-config-merge.service', () => {
    it('preserves referencePresetId when import omits it', () => {
        const merged = mergePluginsOnAppConfigImport(
            {enabled: {'p-grid-export': false}, referencePresetId: 'developer'},
            {enabled: {'p-sql-format': true}},
        )
        assert.equal(merged.referencePresetId, 'developer')
        assert.equal(merged.enabled['p-sql-format'], true)
        assert.equal(merged.enabled['p-grid-export'], undefined)
    })

    it('uses imported referencePresetId when present', () => {
        const merged = mergePluginsOnAppConfigImport(
            {enabled: {}, referencePresetId: 'minimal'},
            {enabled: {}, referencePresetId: 'teamViewer'},
        )
        assert.equal(merged.referencePresetId, 'teamViewer')
    })

    it('keeps current plugins when import has no plugins block', () => {
        const merged = mergePluginsOnAppConfigImport(
            {enabled: {'p-ai-workbench': false}, referencePresetId: 'dba'},
            undefined,
        )
        assert.equal(merged.referencePresetId, 'dba')
        assert.equal(merged.enabled['p-ai-workbench'], false)
    })
})
