import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildCountRowsSql,
    buildSelectFirstNSql,
    buildTableShortcutSql,
    isTableNameSelection,
    parseSelectedTableRef,
    resolveSqlLimitStyle,
} from '@/features/workspace/services/sql-table-shortcut.service'

describe('sql-table-shortcut.service', () => {
    it('accepts bare and qualified table names only', () => {
        assert.equal(parseSelectedTableRef('users'), 'users')
        assert.equal(parseSelectedTableRef('dbo.users'), 'dbo.users')
        assert.equal(parseSelectedTableRef('`a`.`b`'), '`a`.`b`')
        assert.equal(isTableNameSelection('SELECT * FROM users'), false)
        assert.equal(parseSelectedTableRef('users;'), 'users')
        assert.equal(parseSelectedTableRef('a.b.c'), 'a.b.c')
        assert.equal(parseSelectedTableRef('a.b.c.d'), null)
    })

    it('picks dialect limit style', () => {
        assert.equal(resolveSqlLimitStyle('mysql'), 'limit')
        assert.equal(resolveSqlLimitStyle('postgresql'), 'limit')
        assert.equal(resolveSqlLimitStyle('sqlserver'), 'top')
        assert.equal(resolveSqlLimitStyle('oracle'), 'fetch-first')
        assert.equal(resolveSqlLimitStyle('dm'), 'fetch-first')
    })

    it('builds select-first and count SQL per dialect', () => {
        assert.equal(
            buildSelectFirstNSql('mysql', 'users', 50),
            'SELECT * FROM `users` LIMIT 50',
        )
        assert.equal(
            buildSelectFirstNSql('sqlserver', 'dbo.users', 10),
            'SELECT TOP (10) * FROM [dbo].[users]',
        )
        assert.equal(
            buildSelectFirstNSql('oracle', 'HR.EMP', 20),
            'SELECT * FROM "HR"."EMP" FETCH FIRST 20 ROWS ONLY',
        )
        assert.equal(
            buildCountRowsSql('postgresql', 'public.orders'),
            'SELECT COUNT(*) AS cnt FROM "public"."orders"',
        )
        assert.equal(
            buildTableShortcutSql('select-first', 'SELECT 1', 'mysql'),
            null,
        )
    })

    it('preserves already-quoted table refs', () => {
        assert.equal(
            buildSelectFirstNSql('mysql', '`odd-name`', 5),
            'SELECT * FROM `odd-name` LIMIT 5',
        )
    })
})
