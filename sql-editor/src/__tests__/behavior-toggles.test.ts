import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    getSqlEditorAutoTableAliasEnabled,
    getSqlEditorShowColumnCommentInSuggest,
    getSqlEditorShowHintBar,
    setSqlEditorSnippetLayers,
} from '@sql-editor/config/snippets/cache'
import {resolvePersonalLayerForSnippetGate} from '@sql-editor/config/snippets/personal-gate'
import {tableCompletionInsertText} from '@sql-editor/utils/alias'
import {createSqlEditorRuntime} from '../runtime/create-runtime.ts'

describe('behavior toggles → cache / alias insert', () => {
    it('personal showHintBar false hides via cache helper', () => {
        setSqlEditorSnippetLayers({personal: {showHintBar: false}})
        assert.equal(getSqlEditorShowHintBar(), false)
        setSqlEditorSnippetLayers({personal: {showHintBar: true}})
        assert.equal(getSqlEditorShowHintBar(), true)
    })

    it('personal autoTableAlias false stops alias insert text', () => {
        setSqlEditorSnippetLayers({
            pluginShared: {autoTableAlias: true},
            personal: {autoTableAlias: false},
        })
        assert.equal(getSqlEditorAutoTableAliasEnabled(), false)
        const off = tableCompletionInsertText('orders', 'SELECT * FROM ', 15, {}, 'SELECT * FROM ')
        assert.equal(off.insertText, 'orders')

        setSqlEditorSnippetLayers({
            pluginShared: {autoTableAlias: true},
            personal: {autoTableAlias: true},
        })
        assert.equal(getSqlEditorAutoTableAliasEnabled(), true)
        const on = tableCompletionInsertText('orders', 'SELECT * FROM ', 15, {}, 'SELECT * FROM ')
        assert.match(on.insertText, /^orders\s+\w+/)
    })

    it('personal showColumnCommentInSuggest toggles cache helper', () => {
        setSqlEditorSnippetLayers({personal: {showColumnCommentInSuggest: true}})
        assert.equal(getSqlEditorShowColumnCommentInSuggest(), true)
        setSqlEditorSnippetLayers({personal: {showColumnCommentInSuggest: false}})
        assert.equal(getSqlEditorShowColumnCommentInSuggest(), false)
        setSqlEditorSnippetLayers({personal: null})
        assert.equal(getSqlEditorShowColumnCommentInSuggest(), false)
    })

    it('personal snippet gate keeps behavior flags, drops only snippets', () => {
        const gated = resolvePersonalLayerForSnippetGate(
            {
                showHintBar: false,
                autoTableAlias: false,
                showColumnCommentInSuggest: true,
                snippets: [{id: 'x', label: 'x', insertText: 'x', enabled: true, slots: []}],
            },
            false,
        )
        assert.equal(gated?.showHintBar, false)
        assert.equal(gated?.autoTableAlias, false)
        assert.equal(gated?.showColumnCommentInSuggest, true)
        assert.equal(gated?.snippets, undefined)
    })

    it('runtime sync with personal snippets off still publishes hint/alias flags', () => {
        const runtime = createSqlEditorRuntime({
            sync: false,
            snippetLayers: {
                personal: {showHintBar: false, autoTableAlias: false},
            },
        })
        runtime.setPersonalSnippetsEnabled(false)
        setSqlEditorSnippetLayers({
            pluginShared: {autoTableAlias: true},
            personal: {showHintBar: true, autoTableAlias: true},
        })
        runtime.sync()
        assert.equal(getSqlEditorShowHintBar(), false)
        assert.equal(getSqlEditorAutoTableAliasEnabled(), false)
    })

    it('empty personal sync falls back to plugin defaults (reloadFromPersistence required)', () => {
        setSqlEditorSnippetLayers({
            pluginShared: {autoTableAlias: true},
            personal: {showHintBar: false, autoTableAlias: false},
        })
        assert.equal(getSqlEditorShowHintBar(), false)
        assert.equal(getSqlEditorAutoTableAliasEnabled(), false)

        setSqlEditorSnippetLayers({
            pluginShared: {autoTableAlias: true},
            personal: null,
        })
        assert.equal(getSqlEditorShowHintBar(), true)
        assert.equal(getSqlEditorAutoTableAliasEnabled(), true)
    })
})
