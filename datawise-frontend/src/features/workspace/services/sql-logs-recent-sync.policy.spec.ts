import {describe, expect, it} from 'vitest'
import {sqlLogsRecentSyncKey} from '@/features/workspace/services/sql-logs-recent-sync.policy'

describe('sqlLogsRecentSyncKey (PERF-12)', () => {
    it('stays stable when log payload fields change', () => {
        const a = sqlLogsRecentSyncKey(
            [{id: '1'}, {id: '2'}],
            'c1',
            'db',
        )
        const b = sqlLogsRecentSyncKey(
            [{id: '1'}, {id: '2'}],
            'c1',
            'db',
        )
        expect(a).toBe(b)
    })

    it('changes when membership or scope changes', () => {
        const base = sqlLogsRecentSyncKey([{id: '1'}], 'c1', 'db')
        expect(sqlLogsRecentSyncKey([{id: '1'}, {id: '2'}], 'c1', 'db')).not.toBe(base)
        expect(sqlLogsRecentSyncKey([{id: '1'}], 'c2', 'db')).not.toBe(base)
        expect(sqlLogsRecentSyncKey([{id: '1'}], 'c1', 'other')).not.toBe(base)
    })
})
