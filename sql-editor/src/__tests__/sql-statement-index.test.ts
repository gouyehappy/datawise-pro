import assert from 'node:assert/strict'
import test from 'node:test'
import {
    indexSqlStatements,
    resolveGutterStatement,
    findStatementContainingLine,
    isBlankOrCommentOnlyLine,
} from '@sql-editor/utils/sql-statement-index'

const consoleSql = [
    'SELECT *',
    'FROM cdp_segment cs;',
    '',
    'DROP TABLE IF EXISTS admin_db.cdp_segment;',
    '',
    'CREATE TABLE cdp_segment (',
    "  id BIGINT NOT NULL COMMENT '主键',",
    "  segment_name VARCHAR(100) COMMENT '名称',",
    '  PRIMARY KEY (id)',
    ') ENGINE=InnoDB;',
    '',
    '-- AI: stats',
    'SELECT',
    '  COUNT(*) AS total',
    'FROM cdp_tag;',
    '',
    'SELECT SUM(t1.user_count) FROM cdp_tag t1;',
].join('\n')

test('indexSqlStatements returns one span per executable statement', () => {
    const spans = indexSqlStatements(consoleSql)
    assert.equal(spans.length, 5)
    assert.equal(spans[0]?.anchorLine, 1)
    assert.equal(spans[1]?.anchorLine, 4)
    assert.equal(spans[2]?.anchorLine, 6)
    assert.equal(spans[3]?.anchorLine, 13)
    assert.equal(spans[4]?.anchorLine, 17)
})

test('blank lines between statements are not inside any span', () => {
    const spans = indexSqlStatements(consoleSql)
    assert.equal(findStatementContainingLine(spans, 3), null)
    assert.equal(findStatementContainingLine(spans, 5), null)
    assert.equal(findStatementContainingLine(spans, 12), null)
    assert.equal(isBlankOrCommentOnlyLine(consoleSql, 5), true)
})

test('resolveGutterStatement uses cursor statement and anchors to first line', () => {
    const fromContinuation = resolveGutterStatement(consoleSql, 2, null)
    assert.ok(fromContinuation)
    assert.equal(fromContinuation.anchorLine, 1)

    const fromCreateBody = resolveGutterStatement(consoleSql, 8, null)
    assert.ok(fromCreateBody)
    assert.equal(fromCreateBody.anchorLine, 6)

    const fromLaterSelect = resolveGutterStatement(consoleSql, 17, null)
    assert.ok(fromLaterSelect)
    assert.equal(fromLaterSelect.anchorLine, 17)
})

test('resolveGutterStatement ignores blank gutter hover and uses cursor statement', () => {
    const insideCreate = resolveGutterStatement(consoleSql, 8, 5)
    assert.ok(insideCreate)
    assert.equal(insideCreate.anchorLine, 6)
    assert.match(insideCreate.sql, /^CREATE TABLE/)
})

test('resolveGutterStatement uses gutter hover only when cursor is on blank line', () => {
    const fromBlankCursor = resolveGutterStatement(consoleSql, 5, 13)
    assert.ok(fromBlankCursor)
    assert.equal(fromBlankCursor.anchorLine, 13)

    assert.equal(resolveGutterStatement(consoleSql, 5, 5), null)
})

test('resolveGutterStatement keeps statement when cursor is on blank line inside span', () => {
    const sql = [
        'CREATE TABLE t (',
        '  id INT,',
        '',
        '  name TEXT',
        ');',
    ].join('\n')

    // line 3 is blank, but it is inside the CREATE TABLE span (between first/last executable lines)
    const span = resolveGutterStatement(sql, 3, null)
    assert.ok(span)
    assert.equal(span.anchorLine, 1)
})

test('invisible whitespace on blank-looking line does not become statement anchor', () => {
    const sql = [
        'DROP TABLE IF EXISTS admin_db.cdp_segment;',
        '\u00a0',
        'CREATE TABLE cdp_segment (',
        '  id BIGINT NOT NULL',
        ');',
    ].join('\n')

    assert.equal(isBlankOrCommentOnlyLine(sql, 2), true)

    const spans = indexSqlStatements(sql)
    const create = spans.find((span) => span.sql.startsWith('CREATE TABLE'))
    assert.ok(create)
    assert.equal(create.anchorLine, 3)

    const fromCreateBody = resolveGutterStatement(sql, 4, null)
    assert.ok(fromCreateBody)
    assert.equal(fromCreateBody.anchorLine, 3)
})

test('resolveGutterStatement follows cursor statement across blank separators', () => {
    const sql = [
        'SELECT * FROM product;',
        '',
        'SELECT * FROM order_detail;',
        '',
        'SELECT * FROM user;',
    ].join('\n')

    const onProduct = resolveGutterStatement(sql, 1, null)
    assert.ok(onProduct)
    assert.equal(onProduct.anchorLine, 1)

    const onOrderDetail = resolveGutterStatement(sql, 3, null)
    assert.ok(onOrderDetail)
    assert.equal(onOrderDetail.anchorLine, 3)

    const onUser = resolveGutterStatement(sql, 5, null)
    assert.ok(onUser)
    assert.equal(onUser.anchorLine, 5)

    // blank line between statements is not inside any span
    assert.equal(resolveGutterStatement(sql, 2, null), null)
    assert.equal(resolveGutterStatement(sql, 4, null), null)
})

test('resolveGutterStatement anchors multiline cursor statement to first line only', () => {
    const sql = [
        'SELECT',
        '  *',
        'FROM',
        '  user;',
        '',
        'SELECT',
        '  *',
        'FROM',
        '  order_detail;',
    ].join('\n')

    const first = resolveGutterStatement(sql, 4, null)
    assert.ok(first)
    assert.equal(first.anchorLine, 1)
    assert.match(first.sql, /^SELECT/)

    const second = resolveGutterStatement(sql, 9, null)
    assert.ok(second)
    assert.equal(second.anchorLine, 6)
    assert.match(second.sql, /order_detail/)
})

test('CRLF line endings keep anchor on executable line not preceding blank line', () => {
    const sql = [
        'SELECT * FROM product;',
        '',
        'SELECT * FROM order_detail;',
        '',
        'SELECT * FROM user;',
    ].join('\r\n')

    const spans = indexSqlStatements(sql)
    assert.equal(spans[1]?.anchorLine, 3)
    assert.equal(spans[1]?.startLine, 3)
    assert.equal(spans[1]?.endLine, 3)

    const onOrderDetail = resolveGutterStatement(sql, 3, null)
    assert.ok(onOrderDetail)
    assert.equal(onOrderDetail.anchorLine, 3)

    const onUser = resolveGutterStatement(sql, 5, null)
    assert.ok(onUser)
    assert.equal(onUser.anchorLine, 5)
})
