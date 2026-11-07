import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    FREE_SQL_HISTORY_MAX_ENTRIES,
    retainFreeSqlHistoryEntries,
} from '@/features/workspace/services/sql-history-retention'
import {hasExplainProAccess} from '@/features/pack/services/explain-pro-entitlement'

describe('sql-history-retention', () => {
    it('keeps entries under the free cap', () => {
        const kept = retainFreeSqlHistoryEntries([1, 2, 3])
        assert.deepEqual(kept, [1, 2, 3])
    })

    it('trims newest-first lists to the free cap', () => {
        const input = Array.from({length: FREE_SQL_HISTORY_MAX_ENTRIES + 12}, (_, i) => i)
        const kept = retainFreeSqlHistoryEntries(input)
        assert.equal(kept.length, FREE_SQL_HISTORY_MAX_ENTRIES)
        assert.equal(kept[0], 0)
        assert.equal(kept.at(-1), FREE_SQL_HISTORY_MAX_ENTRIES - 1)
    })
})

describe('explain-pro-entitlement', () => {
    it('allows explain pro in open mode', () => {
        assert.equal(hasExplainProAccess({mode: 'open', dataopsUsable: false}), true)
    })

    it('requires dataops when enforced', () => {
        assert.equal(hasExplainProAccess({mode: 'enforced', dataopsUsable: false}), false)
        assert.equal(hasExplainProAccess({mode: 'enforced', dataopsUsable: true}), true)
    })
})
