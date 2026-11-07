import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    planFormatAsYouTypeBreak,
    adjustKeywordInsertNewlines,
} from '../utils/format-as-you-type.ts'
import {buildKeywordInsert} from '../completion/keyword-insert.ts'

describe('format-as-you-type', () => {
    it('SELECT * FROM␠ → 在 FROM 前换行', () => {
        const plan = planFormatAsYouTypeBreak('SELECT * FROM ')
        assert.ok(plan)
        assert.equal(plan!.text, '\n')
        assert.equal(plan!.insertColumn, 'SELECT * '.length + 1)
    })

    it('行首 WHERE␠ 不换行', () => {
        assert.equal(planFormatAsYouTypeBreak('WHERE '), null)
        assert.equal(planFormatAsYouTypeBreak('  WHERE '), null)
    })

    it('LEFT JOIN 优先于 JOIN', () => {
        const plan = planFormatAsYouTypeBreak('SELECT * FROM t LEFT JOIN ')
        assert.ok(plan)
        assert.match(plan!.keyword, /LEFT\s+JOIN/i)
    })

    it('短行 AND 不换行，长行 AND 换行并缩进', () => {
        assert.equal(planFormatAsYouTypeBreak('a = 1 AND '), null)
        const long =
            'SELECT * FROM users WHERE status = 1 AND name = 2 AND '
        const plan = planFormatAsYouTypeBreak(long)
        assert.ok(plan)
        assert.equal(plan!.text, '\n  ')
    })

    it('无尾随空格不触发', () => {
        assert.equal(planFormatAsYouTypeBreak('SELECT * FROM'), null)
    })

    it('补全插入：行中保留前导换行，行首剥掉', () => {
        assert.equal(
            adjustKeywordInsertNewlines('\nWHERE $0', 'SELECT * FROM users '),
            '\nWHERE $0',
        )
        assert.equal(adjustKeywordInsertNewlines('\nWHERE $0', ''), 'WHERE $0')
        assert.equal(adjustKeywordInsertNewlines('\nWHERE $0', '  '), 'WHERE $0')
    })

    it('补全插入：行首仅有将被替换的前缀时也剥掉换行', () => {
        assert.equal(
            adjustKeywordInsertNewlines('\nORDER BY $0', 'o', 'o'),
            'ORDER BY $0',
        )
        assert.equal(
            adjustKeywordInsertNewlines('\nORDER BY $0', '  ord', 'ord'),
            'ORDER BY $0',
        )
        assert.equal(
            adjustKeywordInsertNewlines('\nWHERE $0', 'SELECT * FROM t o', 'o'),
            '\nWHERE $0',
        )
    })

    it('buildKeywordInsert 结合 lineBefore', () => {
        const mid = buildKeywordInsert('WHERE', {
            lineBefore: 'SELECT * FROM t ',
            formatAsYouType: true,
        })
        assert.ok(mid.insertText.startsWith('\nWHERE'))
        const start = buildKeywordInsert('WHERE', {lineBefore: '', formatAsYouType: true})
        assert.equal(start.insertText.startsWith('\n'), false)
        const typedOnNewLine = buildKeywordInsert('ORDER BY', {
            lineBefore: 'o',
            typedPrefix: 'o',
            formatAsYouType: true,
        })
        assert.equal(typedOnNewLine.insertText.startsWith('\n'), false)
    })

    it('关闭边写边断行时补全插入不带前导换行', () => {
        assert.equal(
            adjustKeywordInsertNewlines('\nWHERE $0', 'SELECT * FROM users ', undefined, {
                leadingNewline: false,
            }),
            'WHERE $0',
        )
        assert.equal(
            adjustKeywordInsertNewlines('\n  AND $0', 'a = 1 ', undefined, {leadingNewline: false}),
            'AND $0',
        )
        const mid = buildKeywordInsert('FROM', {
            lineBefore: 'SELECT * ',
            formatAsYouType: false,
        })
        assert.equal(mid.insertText.startsWith('\n'), false)
        assert.match(mid.insertText, /^FROM/)
    })
})
