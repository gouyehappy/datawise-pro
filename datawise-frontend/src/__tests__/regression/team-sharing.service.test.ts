import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {parseDelimitedIds} from '@/features/team/services/team-sharing.service'

describe('team-sharing.service', () => {
    it('parses comma and newline separated ids', () => {
        assert.deepEqual(parseDelimitedIds('c-1, c-2\nc-3'), ['c-1', 'c-2', 'c-3'])
        assert.deepEqual(parseDelimitedIds(''), [])
    })
})
