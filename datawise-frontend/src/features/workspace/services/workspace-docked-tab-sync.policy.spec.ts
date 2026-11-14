import {describe, expect, it} from 'vitest'
import {workspaceDockedTabSyncKey} from '@/features/workspace/services/workspace-docked-tab-sync.policy'

describe('workspaceDockedTabSyncKey (PERF-08)', () => {
    it('stays stable when tab payload fields change', () => {
        const a = workspaceDockedTabSyncKey(
            't1',
            [{id: 't1'}, {id: 't2'}],
            {t2: {x: 1}},
        )
        const b = workspaceDockedTabSyncKey(
            't1',
            [{id: 't1'}, {id: 't2'}],
            {t2: {x: 99, width: 400}},
        )
        expect(a).toBe(b)
    })

    it('changes when active, membership, or float set changes', () => {
        const base = workspaceDockedTabSyncKey('t1', [{id: 't1'}], {})
        expect(workspaceDockedTabSyncKey('t2', [{id: 't1'}], {})).not.toBe(base)
        expect(workspaceDockedTabSyncKey('t1', [{id: 't1'}, {id: 't2'}], {})).not.toBe(base)
        expect(workspaceDockedTabSyncKey('t1', [{id: 't1'}], {t1: {}})).not.toBe(base)
    })
})
