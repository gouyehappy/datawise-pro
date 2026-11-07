import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {WorkspaceTab} from '@/core/types'
import {
    advanceMruHighlight,
    pruneMruTabIds,
    resolveMruSwitcherTabs,
    touchMruTabIds,
} from '@/features/workspace/services/mru-tab-switcher.service'

function tab(id: string, title = id): WorkspaceTab {
    return {id, title, type: 'console', closable: true}
}

describe('mru-tab-switcher.service', () => {
    it('touches active tab to the front and keeps open tabs', () => {
        assert.deepEqual(touchMruTabIds(['a', 'b'], 'c', ['a', 'b', 'c']), ['c', 'a', 'b'])
        assert.deepEqual(touchMruTabIds(['a', 'b', 'c'], 'b', ['a', 'b', 'c']), ['b', 'a', 'c'])
    })

    it('prunes closed tabs and resolves ordered list', () => {
        assert.deepEqual(pruneMruTabIds(['a', 'x', 'b'], ['a', 'b']), ['a', 'b'])
        const tabs = [tab('a'), tab('b'), tab('c')]
        assert.deepEqual(
            resolveMruSwitcherTabs(['c', 'a'], tabs).map((item) => item.id),
            ['c', 'a', 'b'],
        )
    })

    it('advances highlight with wrap', () => {
        assert.equal(advanceMruHighlight(0, 3, 1), 1)
        assert.equal(advanceMruHighlight(2, 3, 1), 0)
        assert.equal(advanceMruHighlight(0, 3, -1), 2)
    })
})
