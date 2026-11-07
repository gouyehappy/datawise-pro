import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    detectAfterCompleteWherePredicate,
    detectAfterCompleteOnPredicate,
    completionSegmentAtOffset,
} from '../completion/grammar/transitions/predicate.ts'

describe('predicate-tail', () => {
    it('detects chained AND with quoted string', () => {
        const segment =
            "SELECT * FROM t WHERE 1=1 AND t1.id = 123 AND t1.tag_name = 'test'"
        assert.equal(detectAfterCompleteWherePredicate(segment, 'where'), true)
    })

    it('detects partial GROUP BY prefix after quoted predicate', () => {
        const segment =
            "SELECT * FROM t WHERE 1=1 AND t1.tag_name = 'test' grou"
        assert.equal(detectAfterCompleteWherePredicate(segment, 'where'), true)
    })

    it('does not trigger mid predicate value', () => {
        const segment = 'SELECT * FROM t WHERE t1.tag_name = \'te'
        assert.equal(detectAfterCompleteWherePredicate(segment, 'where'), false)
    })

    it('completion segment after semicolon uses previous statement', () => {
        const sql = "SELECT * FROM t WHERE id = 1 ;"
        const offset = sql.length
        const bounds = {start: offset, end: sql.length}
        const {segment, afterStatementSemicolon} = completionSegmentAtOffset(sql, offset, bounds)
        assert.equal(afterStatementSemicolon, true)
        assert.match(segment, /WHERE id = 1/)
    })

    it('ON chain with AND still completes', () => {
        const segment = 'SELECT * FROM a JOIN b ON a.id = b.id AND a.x = 1'
        assert.equal(detectAfterCompleteOnPredicate(segment, 'on'), true)
    })

    it('HAVING aggregate comparison completes', () => {
        const segment =
            'SELECT status, COUNT(*) c FROM orders GROUP BY status HAVING COUNT(*) > 1'
        assert.equal(detectAfterCompleteWherePredicate(segment, 'having'), true)
    })

    it('IN list completes', () => {
        assert.equal(
            detectAfterCompleteWherePredicate('SELECT * FROM t WHERE id IN (1, 2)', 'where'),
            true,
        )
    })

    it('BETWEEN completes', () => {
        assert.equal(
            detectAfterCompleteWherePredicate(
                'SELECT * FROM t WHERE amount BETWEEN 1 AND 10',
                'where',
            ),
            true,
        )
    })

    it('IS NOT NULL completes', () => {
        assert.equal(
            detectAfterCompleteWherePredicate('SELECT * FROM t WHERE name IS NOT NULL', 'where'),
            true,
        )
    })
})
