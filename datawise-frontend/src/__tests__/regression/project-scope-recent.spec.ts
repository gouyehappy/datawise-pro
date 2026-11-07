import {afterEach, describe, expect, it} from 'vitest'
import {
    isProjectScopeAll,
    setProjectScopeAll,
    toggleProjectScopeAll,
} from '@/features/project/services/project-scope'
import {
    listRecentProjectIds,
    removeRecentProject,
    touchRecentProject,
} from '@/features/project/services/project-recent'

describe('project-scope', () => {
    afterEach(() => {
        localStorage.removeItem('dw-cli-project-scope-all')
    })

    it('toggles scope-all flag', () => {
        expect(isProjectScopeAll()).toBe(false)
        expect(toggleProjectScopeAll()).toBe(true)
        expect(isProjectScopeAll()).toBe(true)
        setProjectScopeAll(false)
        expect(isProjectScopeAll()).toBe(false)
    })
})

describe('project-recent', () => {
    afterEach(() => {
        localStorage.removeItem('dw-cli-recent-project-ids')
    })

    it('tracks recent ids and remove', () => {
        touchRecentProject('a')
        touchRecentProject('b')
        touchRecentProject('a')
        expect(listRecentProjectIds()).toEqual(['a', 'b'])
        removeRecentProject('a')
        expect(listRecentProjectIds()).toEqual(['b'])
    })
})
