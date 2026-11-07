import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    isSqlEditorThemeHostManaged,
    resolveSqlEditorTheme,
} from '../utils/resolve-editor-theme.ts'

describe('resolveSqlEditorTheme', () => {
    it('prefers personal theme in standalone mode', () => {
        assert.equal(
            resolveSqlEditorTheme({
                personalTheme: 'github-light',
                hostTheme: 'one-dark',
            }),
            'github-light',
        )
    })

    it('prefers host theme when host-managed', () => {
        assert.equal(
            resolveSqlEditorTheme({
                personalTheme: 'github-light',
                hostTheme: 'one-dark',
                hostManaged: true,
            }),
            'one-dark',
        )
    })

    it('falls back to host then prop', () => {
        assert.equal(
            resolveSqlEditorTheme({
                hostTheme: 'github-light',
                propTheme: 'one-dark',
            }),
            'github-light',
        )
        assert.equal(
            resolveSqlEditorTheme({
                propTheme: 'one-dark',
            }),
            'one-dark',
        )
    })
})

describe('isSqlEditorThemeHostManaged', () => {
    it('detects setTheme callback', () => {
        assert.equal(isSqlEditorThemeHostManaged(null), false)
        assert.equal(isSqlEditorThemeHostManaged({theme: 'one-dark'}), false)
        assert.equal(
            isSqlEditorThemeHostManaged({setTheme: () => {}}),
            true,
        )
    })
})
