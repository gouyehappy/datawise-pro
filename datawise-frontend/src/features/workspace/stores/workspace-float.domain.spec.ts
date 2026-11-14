import {describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import type {WorkspaceTab} from '@/core/types'
import {createWorkspaceFloatDomain} from '@/features/workspace/stores/workspace-float.domain'

function tab(partial: Partial<WorkspaceTab> & Pick<WorkspaceTab, 'id' | 'title' | 'type'>): WorkspaceTab {
    return {closable: true, ...partial}
}

describe('createWorkspaceFloatDomain', () => {
    it('floats a tab, raises z-order, and docks back', () => {
        const tabs = ref<WorkspaceTab[]>([tab({id: 't1', title: 'One', type: 'console'})])
        const activeTabId = ref<string | null>(null)
        const activateTab = vi.fn((id: string) => {
            activeTabId.value = id
        })

        const float = createWorkspaceFloatDomain({
            tabs,
            activeTabId,
            activateTab,
        })

        float.floatTab('t1', {width: 1000, height: 700}, {x: 40, y: 40, width: 400, height: 300})
        expect(float.isTabFloated('t1')).toBe(true)
        expect(float.floatedTabIds()).toEqual(['t1'])
        expect(activeTabId.value).toBe('t1')
        const firstZ = float.getTabFloat('t1')!.zIndex

        float.raiseTabFloat('t1')
        expect(float.getTabFloat('t1')!.zIndex).toBeGreaterThan(firstZ)

        float.dockTab('t1')
        expect(float.isTabFloated('t1')).toBe(false)
        expect(activateTab).toHaveBeenCalledWith('t1')
    })

    it('clampOpenTabFloatsToBounds shrinks open floats into smaller bounds', () => {
        const tabs = ref<WorkspaceTab[]>([
            tab({id: 't1', title: 'One', type: 'console'}),
            tab({id: 't2', title: 'Two', type: 'console'}),
        ])
        const activeTabId = ref<string | null>('t1')
        const float = createWorkspaceFloatDomain({
            tabs,
            activeTabId,
            activateTab: vi.fn(),
        })

        float.floatTab('t1', {width: 1200, height: 800}, {x: 700, y: 100, width: 520, height: 360})
        float.clampOpenTabFloatsToBounds({width: 500, height: 400})

        const a = float.getTabFloat('t1')!
        expect(a.x).toBeGreaterThanOrEqual(0)
        expect(a.y).toBeGreaterThanOrEqual(0)
        expect(a.x + a.width).toBeLessThanOrEqual(500)
        // Title strip stays visible (clamp allows stored height to extend past the bottom).
        expect(a.y + Math.min(a.height, 36)).toBeLessThanOrEqual(400)
    })

    it('resetAllTabFloats clears map and snap guide', () => {
        const tabs = ref<WorkspaceTab[]>([tab({id: 't1', title: 'One', type: 'console'})])
        const activeTabId = ref<string | null>('t1')
        const float = createWorkspaceFloatDomain({
            tabs,
            activeTabId,
            activateTab: vi.fn(),
        })

        float.floatTab('t1', {width: 800, height: 600})
        float.setTabFloatSnapGuide({
            edge: 'left',
            rect: {x: 0, y: 0, width: 400, height: 600},
        })
        float.resetAllTabFloats()
        expect(float.floatedTabIds()).toEqual([])
        expect(float.tabFloatSnapGuide.value).toBeNull()
    })
})
