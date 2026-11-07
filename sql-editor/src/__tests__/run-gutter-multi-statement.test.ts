import assert from 'node:assert/strict'
import test from 'node:test'
import {resolveRunGutterStatement, resolveStatementAtLine} from '@sql-editor/utils/statement-at-cursor'

const editorSql = [
    'SELECT *',
    'FROM cdp_segment cs;',
    '',
    'DROP TABLE IF EXISTS admin_db.cdp_segment;',
    '',
    'CREATE TABLE cdp_segment (',
    "  id BIGINT NOT NULL COMMENT '主键',",
    "  segment_name VARCHAR(100) COMMENT '名称'",
    ');',
    '',
    'SELECT SUM(t1.user_count) FROM cdp_tag t1;',
    'SELECT SUM(t1.user_count) FROM cdp_tag t1 LEFT JOIN cdp_segment t2 ON t1.id = t2.tag_ids;',
].join('\n')

test('multiline select shows gutter button on anchor line 1 when cursor on line 2', () => {
    const result = resolveRunGutterStatement(editorSql, 2, null)
    assert.ok(result)
    assert.equal(result.displayLine, 1)
    assert.equal(result.anchorLine, 1)
    assert.equal(result.endLine, 2)
})

test('later standalone statements resolve when cursor clicks their lines', () => {
    const drop = resolveRunGutterStatement(editorSql, 4, null)
    assert.ok(drop)
    assert.equal(drop.displayLine, 4)
    assert.match(drop.sql, /^DROP TABLE/)

    const create = resolveRunGutterStatement(editorSql, 7, null)
    assert.ok(create)
    assert.equal(create.displayLine, 6)
    assert.match(create.sql, /^CREATE TABLE/)

    const sum1 = resolveRunGutterStatement(editorSql, 11, null)
    assert.ok(sum1)
    assert.equal(sum1.displayLine, 11)

    const sum2 = resolveRunGutterStatement(editorSql, 12, null)
    assert.ok(sum2)
    assert.equal(sum2.displayLine, 12)
})

test('blank line between statements does not inherit previous statement gutter', () => {
    assert.equal(resolveStatementAtLine(editorSql, 3), null)
    assert.equal(resolveStatementAtLine(editorSql, 10), null)
})
