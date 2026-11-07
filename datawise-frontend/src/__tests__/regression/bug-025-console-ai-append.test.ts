import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    appendConsoleAiSql,
    formatConsoleAiSqlBlock,
} from '@/features/workspace/services/console-ai-sql.service'

describe('console ai sql append', () => {
    it('prepends AI comment when generated sql has no header', () => {
        const block = formatConsoleAiSqlBlock('查询 tag 数量', 'SELECT COUNT(*) FROM cdp_tag;')
        assert.equal(block, '-- AI: 查询 tag 数量\nSELECT COUNT(*) FROM cdp_tag;')
    })

    it('keeps existing AI comment from mock provider', () => {
        const sql = '-- AI: 查询 tag 数量\nSELECT * FROM cdp_tag;'
        assert.equal(formatConsoleAiSqlBlock('查询 tag 数量', sql), sql)
    })

    it('appends to existing editor content with blank line separator', () => {
        const next = appendConsoleAiSql(
            'SELECT 1;',
            '统计用户',
            'SELECT COUNT(*) FROM user;',
        )
        assert.equal(
            next.text,
            'SELECT 1;\n\n-- AI: 统计用户\nSELECT COUNT(*) FROM user;',
        )
        assert.equal(next.focusLine, 3)
    })

    it('uses generated block directly when editor is empty', () => {
        const next = appendConsoleAiSql('', '查询 tag', 'SELECT * FROM cdp_tag;')
        assert.equal(next.text, '-- AI: 查询 tag\nSELECT * FROM cdp_tag;')
        assert.equal(next.focusLine, 1)
    })

    it('focusLine points to AI comment after multi-line existing content', () => {
        const next = appendConsoleAiSql(
            'SELECT 1;\nSELECT 2;',
            '统计用户',
            'SELECT COUNT(*) FROM user;',
        )
        assert.equal(next.focusLine, 4)
    })
})
