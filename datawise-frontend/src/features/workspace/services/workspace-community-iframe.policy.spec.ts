import {describe, expect, it, beforeEach, vi} from 'vitest'
import type {WorkspaceTab} from '@/core/types'
import {
    COMMUNITY_WORKBENCH_IFRAME_MAX,
    ensureCommunityWorkbenchIframeCapacity,
    listCommunityWorkbenchTabs,
    pickCommunityWorkbenchEvictionVictim,
    resetCommunityWorkbenchFocusForTests,
    touchCommunityWorkbenchFocus,
} from '@/features/workspace/services/workspace-community-iframe.policy'

function wb(id: string, pluginId = 'p'): WorkspaceTab {
    return {
        id,
        title: id,
        type: 'community-workbench',
        closable: true,
        pluginId,
    }
}

describe('workspace-community-iframe.policy', () => {
    beforeEach(() => {
        resetCommunityWorkbenchFocusForTests()
    })

    it('exposes a positive soft cap', () => {
        expect(COMMUNITY_WORKBENCH_IFRAME_MAX).toBeGreaterThan(0)
    })

    it('picks oldest focus as eviction victim and never protected ids', () => {
        const tabs = [wb('a'), wb('b'), wb('c')]
        touchCommunityWorkbenchFocus('a')
        touchCommunityWorkbenchFocus('b')
        touchCommunityWorkbenchFocus('c')
        expect(pickCommunityWorkbenchEvictionVictim(tabs, new Set(['a']))).toBe('b')
        expect(pickCommunityWorkbenchEvictionVictim(tabs, new Set(['a', 'b', 'c']))).toBeNull()
    })

    it('evicts until under max without closing the active tab', () => {
        const tabs = [wb('1'), wb('2'), wb('3'), wb('active')]
        touchCommunityWorkbenchFocus('1')
        touchCommunityWorkbenchFocus('2')
        touchCommunityWorkbenchFocus('3')
        touchCommunityWorkbenchFocus('active')
        const closed: string[] = []
        ensureCommunityWorkbenchIframeCapacity({
            tabs,
            activeTabId: 'active',
            max: 2,
            closeTab: (id) => {
                closed.push(id)
                const index = tabs.findIndex((tab) => tab.id === id)
                if (index >= 0) tabs.splice(index, 1)
            },
        })
        // Pre-create: leave room for one new iframe (length < max).
        expect(closed).toEqual(['1', '2', '3'])
        expect(listCommunityWorkbenchTabs(tabs).map((tab) => tab.id)).toEqual(['active'])
        expect(closed.includes('active')).toBe(false)
    })

    it('is a no-op when under capacity', () => {
        const closeTab = vi.fn()
        ensureCommunityWorkbenchIframeCapacity({
            tabs: [wb('1')],
            activeTabId: '1',
            max: 8,
            closeTab,
        })
        expect(closeTab).not.toHaveBeenCalled()
    })
})
