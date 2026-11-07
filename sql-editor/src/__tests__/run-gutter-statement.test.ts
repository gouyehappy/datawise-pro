import assert from 'node:assert/strict'
import test from 'node:test'
import {
    resolveRunGutterContextLine,
    resolveRunGutterStatement,
    resolveStatementAtCursor,
    resolveStatementAtLine,
} from '@sql-editor/utils/statement-at-cursor'

const sampleSql = [
    'SELECT * FROM admin_db.cdp_tag limit 1;',
    '',
    'SELECT * FROM admin_db.cdp_tag t1 WHERE t1.id;',
    '',
    'SELECT * FROM cdp_tag t1 LEFT JOIN table t2 ON t1.id = t2.id;',
].join('\n')

test('resolveStatementAtCursor handles multiline select with cursor on line 1', () => {
    const sql = 'SELECT *\nFROM cdp_segment cs;'
    const cursorAfterStar = sql.indexOf('*') + 1
    const result = resolveStatementAtCursor(sql, cursorAfterStar)
    assert.ok(result)
    assert.equal(result.startLine, 1)
    assert.equal(result.endLine, 2)
    assert.match(result.sql, /^SELECT \*\s+FROM cdp_segment cs$/)
})

test('resolveStatementAtLine returns null for blank lines', () => {
    const sql = 'SELECT 1;\n\nSELECT 2;'
    assert.equal(resolveStatementAtLine(sql, 2), null)
})

test('resolveStatementAtLine on continuation line resolves full statement at anchor line 1', () => {
    const sql = 'SELECT *\nFROM admin_db.cdp_tag\nWHERE id = 1;'
    const result = resolveStatementAtLine(sql, 2)
    assert.ok(result)
    assert.equal(result.anchorLine, 1)
    assert.equal(result.startLine, 1)
    assert.equal(result.endLine, 3)
    assert.match(result.sql, /^SELECT \*\s+FROM admin_db\.cdp_tag\s+WHERE id = 1$/)
})

test('resolveStatementAtLine on middle line matches cursor resolution', () => {
    const sql = 'SELECT *\nFROM t;'
    const fromLine = resolveStatementAtLine(sql, 2)
    const fromCursor = resolveStatementAtCursor(sql, sql.indexOf('FROM'))
    assert.deepEqual(fromLine, fromCursor)
})

test('resolveRunGutterContextLine prefers cursor line over gutter hover', () => {
    assert.equal(resolveRunGutterContextLine(sampleSql, 3, 1), 3)
    assert.equal(resolveRunGutterContextLine(sampleSql, 3, 2), 3)
})

test('resolveRunGutterContextLine uses gutter hover only on blank cursor line', () => {
    assert.equal(resolveRunGutterContextLine(sampleSql, 2, 1), 1)
    assert.equal(resolveRunGutterContextLine(sampleSql, 2, 3), 3)
    assert.equal(resolveRunGutterContextLine(sampleSql, 2, 2), null)
})

test('resolveRunGutterContextLine keeps cursor statement when gutter hovers another statement', () => {
    const sql = [
        'DELETE FROM cdp_tag ct',
        'WHERE',
        '  ct.id = 15;',
        '',
        '-- AI: stats',
        'SELECT',
        '  t.id',
        'FROM cdp_tag t;',
    ].join('\n')
    assert.equal(resolveRunGutterContextLine(sql, 6, 1), 6)
    const statement = resolveRunGutterStatement(sql, 6, 1)
    assert.ok(statement)
    assert.equal(statement.anchorLine, 6)
    assert.match(statement.sql, /^SELECT/)
})

test('resolveRunGutterStatement shows button on anchor when cursor is on continuation line', () => {
    const sql = [
        'SELECT',
        '  t.id',
        'FROM cdp_tag t',
        'LEFT JOIN cdp_segment t2 ON t1.id = t2.tag_ids;',
        '',
        'SELECT SUM(t1.user_count) FROM cdp_tag t1 LEFT JOIN cdp_segment t2 ON t1.id = t2.tag_ids;',
    ].join('\n')
    const onJoinLine = resolveRunGutterStatement(sql, 4, null)
    assert.ok(onJoinLine)
    assert.equal(onJoinLine.displayLine, 1)
    assert.equal(onJoinLine.anchorLine, 1)
    const onSingleLine = resolveRunGutterStatement(sql, 6, null)
    assert.ok(onSingleLine)
    assert.equal(onSingleLine.displayLine, 6)
    assert.equal(onSingleLine.anchorLine, 6)
})

test('resolveRunGutterStatement on line 3 shows button on statement anchor', () => {
    const statement = resolveRunGutterStatement(sampleSql, 3, 1)
    assert.ok(statement)
    assert.equal(statement.anchorLine, 3)
    assert.equal(statement.startLine, 3)
    assert.equal(statement.endLine, 3)
    assert.match(statement.sql, /WHERE t1\.id/)
})
