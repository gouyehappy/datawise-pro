import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {buildDegradedSqlErrorHint} from '@/features/workspace/services/console-ai-degraded.service'

describe('console-ai-degraded', () => {
    it('classifies common SQL error shapes', () => {
        assert.equal(
            buildDegradedSqlErrorHint('You have an error in your SQL syntax near SELECT'),
            'sqlSyntax',
        )
        assert.equal(buildDegradedSqlErrorHint('Unknown column \'foo\' in field list'), 'unknownColumn')
        assert.equal(buildDegradedSqlErrorHint('Table \'db.missing\' doesn\'t exist'), 'unknownTable')
        assert.equal(buildDegradedSqlErrorHint('Access denied for user'), 'permission')
        assert.equal(buildDegradedSqlErrorHint('Duplicate entry for key PRIMARY'), 'duplicate')
        assert.equal(buildDegradedSqlErrorHint('Query timed out'), 'timeout')
        assert.equal(buildDegradedSqlErrorHint('something odd happened'), 'generic')
        assert.equal(buildDegradedSqlErrorHint(''), null)
        assert.equal(buildDegradedSqlErrorHint(null), null)
    })
})
