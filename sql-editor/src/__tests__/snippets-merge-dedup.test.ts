import assert from 'node:assert'
import {describe, it} from 'node:test'
import {getPluginBundledSharedLayer} from '../config/snippets/builtin.ts'
import {resolveSqlEditorShortcutsLayers, snippetIdentityKey, filterRedundantGlobalSnippetsForDisplay} from '../config/snippets/merge.ts'

describe('resolveSqlEditorShortcutsLayers snippet dedupe', () => {
    it('merges plugin overlay onto constants by slot+label instead of duplicating', () => {
        const plugin = getPluginBundledSharedLayer()
        const settings = resolveSqlEditorShortcutsLayers({pluginShared: plugin})

        const between = settings.snippets.filter((item) => item.label.toLowerCase() === 'between')
        assert.equal(between.length, 1, 'between should appear once')
        assert.equal(between[0]?.id, 'where.between')

        const ij = settings.snippets.filter((item) => item.label.toLowerCase() === 'ij')
        assert.equal(ij.length, 1)
        assert.equal(ij[0]?.id, 'join.ij')

        const eq = settings.snippets.filter((item) => item.label.toLowerCase() === 'eq')
        assert.equal(eq.length, 1)
        assert.equal(eq[0]?.id, 'on.eq')
    })

    it('snippetIdentityKey uses primary slot and label', () => {
        assert.equal(
            snippetIdentityKey({id: 'where.between', label: 'between', slots: ['where']}),
            'where:between',
        )
        assert.equal(
            snippetIdentityKey({id: 'between', label: 'between', slots: []}),
            'statement_start:between',
        )
    })

    it('filterRedundantGlobalSnippetsForDisplay hides global duplicates but keeps full SELECT templates', () => {
        const plugin = getPluginBundledSharedLayer()
        const settings = resolveSqlEditorShortcutsLayers({pluginShared: plugin})
        const display = filterRedundantGlobalSnippetsForDisplay(settings.snippets)

        assert.equal(display.filter((s) => s.label.toLowerCase() === 'between').length, 1)
        assert.equal(display.filter((s) => s.label.toLowerCase() === 'in').length, 1)
        assert.equal(display.filter((s) => s.label.toLowerCase() === 'win').length, 1)
        assert.ok(display.some((s) => s.id === 'global.cnt'))
        assert.ok(display.some((s) => s.id === 'select_list.cnt'))
        assert.ok(display.some((s) => s.id === 'group_by.cnt'))
    })
})
