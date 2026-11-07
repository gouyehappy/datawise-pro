import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildPluginConfigExport,
    mergeImportedPluginOverrides,
    parsePluginConfigImport,
} from '@/features/plugin/services/plugin-config.service'

describe('plugin-config.service', () => {
    it('buildPluginConfigExport normalizes plugin ids and includes usage', () => {
        const payload = buildPluginConfigExport(
            {
                'p-grid-export': false,
                'p-csv-export': true,
            },
            {'p-sql-format': {enable: 2, disable: 1, lastAt: '2026-06-28T00:00:00.000Z'}},
        )
        assert.equal(payload.version, 2)
        assert.equal(payload.enabled['p-grid-export'], true)
        assert.equal(payload.usage?.['p-sql-format']?.enable, 2)
    })

    it('parsePluginConfigImport accepts versioned payloads with usage', () => {
        const versioned = parsePluginConfigImport({
            version: 2,
            enabled: {'p-sql-format': false, unknown: true},
            usage: {'p-console-ai': {enable: 1, disable: 0}},
        })
        assert.deepEqual(versioned?.enabled, {'p-sql-format': false})
        assert.equal(versioned?.usage?.['p-console-ai']?.enable, 1)

        const flat = parsePluginConfigImport({enabled: {'p-console-ai': true}})
        assert.deepEqual(flat?.enabled, {'p-console-ai': true})
    })

    it('parsePluginConfigImport accepts usage-only payload', () => {
        const usageOnly = parsePluginConfigImport({
            version: 2,
            enabled: {},
            usage: {'p-grid-export': {enable: 3, disable: 0}},
        })
        assert.deepEqual(usageOnly?.enabled, {})
        assert.equal(usageOnly?.usage?.['p-grid-export']?.enable, 3)
    })

    it('mergeImportedPluginOverrides merges without dropping unrelated keys', () => {
        const merged = mergeImportedPluginOverrides(
            {'p-grid-export': false, 'p-sql-format': true},
            {'p-console-ai': false},
        )
        assert.equal(merged['p-grid-export'], false)
        assert.equal(merged['p-sql-format'], true)
        assert.equal(merged['p-console-ai'], false)
    })

    it('buildPluginConfigExport includes referencePresetId when not minimal', () => {
        const payload = buildPluginConfigExport({}, undefined, 'developer')
        assert.equal(payload.referencePresetId, 'developer')
        const minimal = buildPluginConfigExport({}, undefined, 'minimal')
        assert.equal(minimal.referencePresetId, undefined)
    })

    it('parsePluginConfigImport reads referencePresetId', () => {
        const parsed = parsePluginConfigImport({
            version: 2,
            enabled: {},
            referencePresetId: 'teamViewer',
        })
        assert.equal(parsed?.referencePresetId, 'teamViewer')
    })
})
