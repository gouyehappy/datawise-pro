import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {detectAfterCompleteGroupByList} from '../completion/grammar/transitions/clause.ts'

describe('clause-tail — GROUP BY', () => {
    it('fresh GROUP BY is not complete', () => {
        assert.equal(
            detectAfterCompleteGroupByList('SELECT status FROM t GROUP BY ', 'group_by'),
            false,
        )
    })

    it('after comma is not complete', () => {
        assert.equal(
            detectAfterCompleteGroupByList('SELECT status FROM t GROUP BY status, ', 'group_by'),
            false,
        )
    })

    it('single column is complete', () => {
        assert.equal(
            detectAfterCompleteGroupByList('SELECT status FROM t GROUP BY status', 'group_by'),
            true,
        )
    })

    it('partial ORDER BY prefix still counts as complete list', () => {
        assert.equal(
            detectAfterCompleteGroupByList('SELECT status FROM t GROUP BY status ord', 'group_by'),
            true,
        )
    })
})
