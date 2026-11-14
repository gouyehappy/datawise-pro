import {describe, expect, it} from 'vitest'
import {workspaceSessionStructureKey} from '@/features/workspace/services/workspace-session-persist.policy'

describe('workspaceSessionStructureKey (PERF-13)', () => {
    it('does not include sql body in the structure key', () => {
        const a = workspaceSessionStructureKey(
            't1',
            [{id: 't1', title: 'A', type: 'console'}],
            [],
            [],
        )
        const b = workspaceSessionStructureKey(
            't1',
            [{id: 't1', title: 'A', type: 'console'}],
            [],
            [],
        )
        expect(a).toBe(b)
    })

    it('changes when active, tabs, title, groups, or floats change', () => {
        const base = workspaceSessionStructureKey('t1', [{id: 't1', title: 'A'}], [], [])
        expect(workspaceSessionStructureKey('t2', [{id: 't1', title: 'A'}], [], [])).not.toBe(base)
        expect(workspaceSessionStructureKey('t1', [{id: 't1'}, {id: 't2'}], [], [])).not.toBe(base)
        expect(workspaceSessionStructureKey('t1', [{id: 't1', title: 'B'}], [], [])).not.toBe(base)
        expect(workspaceSessionStructureKey('t1', [{id: 't1', title: 'A'}], [{id: 'g'}], [])).not.toBe(base)
        expect(workspaceSessionStructureKey('t1', [{id: 't1', title: 'A'}], [], ['t1'])).not.toBe(base)
    })
})
