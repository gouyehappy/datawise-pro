import {describe, expect, it} from 'vitest'
import type {WorkspaceTab} from '@/core/types'
import {
    buildTabBarSegments,
    clearOrphanTabGroupIds,
    defaultGroupTitle,
    ejectTabByDrop,
    formatGroupDisplayTitle,
    mergeTabsByDrop,
    pruneEmptyTabGroups,
    reorderTabByDrop,
    resolveTabDropZone,
    stripGroupTitleCount,
} from './workspace-tab-layout.service'

function tab(id: string, title = id, tabGroupId?: string): WorkspaceTab {
    return {id, title, type: 'console', closable: true, tabGroupId}
}

describe('resolveTabDropZone', () => {
    const rect = {left: 0, width: 100} as DOMRect
    it('maps sides and center', () => {
        expect(resolveTabDropZone(10, rect)).toBe('before')
        expect(resolveTabDropZone(50, rect)).toBe('on')
        expect(resolveTabDropZone(90, rect)).toBe('after')
    })
})

describe('defaultGroupTitle', () => {
    it('uses type labels and mixed first-title form without count', () => {
        expect(defaultGroupTitle([
            {id: 'a', title: 'SSH Terminal', type: 'ssh-terminal', closable: true},
            {id: 'b', title: 'SSH Terminal', type: 'ssh-terminal', closable: true},
        ], '工作组')).toBe('SSH')
        expect(defaultGroupTitle([
            {id: 'a', title: 'SSH Terminal', type: 'ssh-terminal', closable: true},
            {id: 'b', title: 'HTTP Client', type: 'console', closable: true},
        ], '工作组')).toBe('SSH Terminal')
        expect(formatGroupDisplayTitle('SSH', 3)).toBe('SSH · 3')
        expect(stripGroupTitleCount('SSH · 3')).toBe('SSH')
    })
})

describe('reorderTabByDrop', () => {
    it('moves tab before target', () => {
        const tabs = [tab('a'), tab('b'), tab('c')]
        expect(reorderTabByDrop(tabs, 'c', 'a', 'before').map((t) => t.id)).toEqual(['c', 'a', 'b'])
    })

    it('ejects onto the main bar when dropping after the last grouped sibling', () => {
        const tabs = [tab('a', 'a', 'g1'), tab('b', 'b', 'g1'), tab('c', 'c', 'g1')]
        const next = reorderTabByDrop(tabs, 'c', 'b', 'after')
        expect(next.map((t) => t.id)).toEqual(['a', 'b', 'c'])
        expect(next.find((t) => t.id === 'c')?.tabGroupId).toBeUndefined()
    })

    it('ejects when dropping before the first grouped sibling', () => {
        const tabs = [tab('a', 'a', 'g1'), tab('b', 'b', 'g1'), tab('c')]
        const next = reorderTabByDrop(tabs, 'c', 'a', 'before')
        expect(next.map((t) => t.id)).toEqual(['c', 'a', 'b'])
        expect(next.find((t) => t.id === 'c')?.tabGroupId).toBeUndefined()
    })

    it('ungroups when dropping away from any group cluster', () => {
        const tabs = [tab('a', 'a', 'g1'), tab('b', 'b', 'g1'), tab('c'), tab('d')]
        const next = reorderTabByDrop(tabs, 'a', 'd', 'after')
        expect(next.map((t) => t.id)).toEqual(['b', 'c', 'd', 'a'])
        expect(next.find((t) => t.id === 'a')?.tabGroupId).toBeUndefined()
    })

    it('adopts neighbor group when inserting into a cluster', () => {
        const tabs = [tab('a', 'a', 'g1'), tab('b', 'b', 'g1'), tab('c')]
        const next = reorderTabByDrop(tabs, 'c', 'b', 'before')
        expect(next.map((t) => t.id)).toEqual(['a', 'c', 'b'])
        expect(next.find((t) => t.id === 'c')?.tabGroupId).toBe('g1')
    })
})

describe('ejectTabByDrop', () => {
    it('clears group membership and moves to the end of the bar', () => {
        const tabs = [tab('a', 'a', 'g1'), tab('b', 'b', 'g1'), tab('c', 'c', 'g1')]
        const next = ejectTabByDrop(tabs, 'b', null, 'end')
        expect(next.map((t) => t.id)).toEqual(['a', 'c', 'b'])
        expect(next.find((t) => t.id === 'b')?.tabGroupId).toBeUndefined()
        expect(next.find((t) => t.id === 'a')?.tabGroupId).toBe('g1')
    })
})

describe('mergeTabsByDrop', () => {
    it('creates a group when stacking onto an ungrouped tab', () => {
        const tabs = [tab('a'), tab('b'), tab('c')]
        const result = mergeTabsByDrop(tabs, [], 'c', 'a', () => 'g-new', 'Group')
        expect(result.groups).toHaveLength(1)
        expect(result.tabs.find((t) => t.id === 'a')?.tabGroupId).toBe('g-new')
        expect(result.tabs.find((t) => t.id === 'c')?.tabGroupId).toBe('g-new')
        expect(result.tabs.map((t) => t.id)).toEqual(['a', 'c', 'b'])
    })

    it('joins an existing group', () => {
        const tabs = [tab('a', 'a', 'g1'), tab('b', 'b', 'g1'), tab('c')]
        const result = mergeTabsByDrop(
            tabs,
            [{id: 'g1', title: 'SSH ×2'}],
            'c',
            'b',
            () => 'x',
            'Group',
        )
        expect(result.groups).toHaveLength(1)
        expect(result.tabs.filter((t) => t.tabGroupId === 'g1')).toHaveLength(3)
    })

    it('allows different tab types in one group', () => {
        const ssh: WorkspaceTab = {
            id: 'ssh',
            title: 'SSH Terminal',
            type: 'ssh-terminal',
            closable: true,
        }
        const sql = tab('sql', 'HTTP / SQL')
        const result = mergeTabsByDrop([ssh, sql], [], 'sql', 'ssh', () => 'g-mix', '分组')
        expect(result.groups).toHaveLength(1)
        expect(result.tabs.every((t) => t.tabGroupId === 'g-mix')).toBe(true)
        expect(defaultGroupTitle(result.tabs, '分组')).toBe('SSH Terminal')
    })
})

describe('buildTabBarSegments', () => {
    it('clusters consecutive group members', () => {
        const tabs = [tab('a', 'a', 'g1'), tab('b', 'b', 'g1'), tab('c')]
        const segments = buildTabBarSegments(tabs, [{id: 'g1', title: 'G'}])
        expect(segments).toHaveLength(2)
        expect(segments[0]).toMatchObject({kind: 'group'})
        expect(segments[1]).toMatchObject({kind: 'tab', tab: {id: 'c'}})
    })
})

describe('pruneEmptyTabGroups', () => {
    it('drops groups with fewer than two tabs', () => {
        const tabs = [tab('a', 'a', 'g1'), tab('b')]
        const groups = pruneEmptyTabGroups(tabs, [{id: 'g1', title: 'G'}])
        expect(groups).toEqual([])
        expect(clearOrphanTabGroupIds(tabs, groups)[0].tabGroupId).toBeUndefined()
    })
})
