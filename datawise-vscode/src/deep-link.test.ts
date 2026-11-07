import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {buildDeepLinkUrl, resolveSqlFromEditorText} from './deep-link'

describe('deep-link', () => {
    it('builds datawise open urls', () => {
        const url = buildDeepLinkUrl({
            connectionId: 'conn-1',
            database: 'mydb',
            sql: 'SELECT 1',
        })
        assert.equal(url, 'datawise://open?connectionId=conn-1&database=mydb&sql=SELECT+1')
    })

    it('prefers selection over full document text', () => {
        assert.equal(
            resolveSqlFromEditorText('SELECT 1;\nSELECT 2;', 'SELECT 2', true),
            'SELECT 2',
        )
        assert.equal(
            resolveSqlFromEditorText('SELECT 1;\nSELECT 2;', '', false),
            'SELECT 1;\nSELECT 2;',
        )
    })

    it('trims whitespace from resolved sql', () => {
        assert.equal(resolveSqlFromEditorText('  SELECT 1  ', '  SELECT 2  ', true), 'SELECT 2')
    })
})
