import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildShareableConnectionOptions,
    parseDelimitedIds,
    toggleSharedConnectionId,
} from '@/features/team/services/team-sharing.service'

describe('team-sharing.service', () => {
    it('parses comma and newline separated ids', () => {
        assert.deepEqual(parseDelimitedIds('c-1, c-2\nc-3'), ['c-1', 'c-2', 'c-3'])
        assert.deepEqual(parseDelimitedIds(''), [])
    })

    it('toggles shared connection ids', () => {
        assert.deepEqual(toggleSharedConnectionId(['a'], 'b'), ['a', 'b'])
        assert.deepEqual(toggleSharedConnectionId(['a', 'b'], 'a'), ['b'])
    })

    it('merges explorer options with already-shared ids', () => {
        assert.deepEqual(
            buildShareableConnectionOptions(
                [{id: 'c1', label: 'Prod'}],
                ['c1', 'legacy'],
            ),
            [
                {id: 'legacy', label: 'legacy'},
                {id: 'c1', label: 'Prod'},
            ],
        )
    })
})
