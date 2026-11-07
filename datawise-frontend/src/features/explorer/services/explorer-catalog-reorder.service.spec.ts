import {describe, expect, it} from 'vitest'
import type {TreeNode} from '@/core/types'
import {
    isCatalogReorderDraggable,
    resolveCatalogReorderDrop,
    resolveCatalogReorderPosition,
} from '@/features/explorer/services/explorer-catalog-reorder.service'
import {EXPLORER_FAVORITES_GROUP_ID} from '@/features/explorer/services/explorer-favorites.constants'

function node(partial: Partial<TreeNode> & Pick<TreeNode, 'id' | 'type'>): TreeNode {
    return {
        label: partial.label ?? partial.id,
        ...partial,
    }
}

describe('explorer-catalog-reorder.service', () => {
    it('allows dragging groups and connections but not favorites', () => {
        expect(isCatalogReorderDraggable(node({id: 'g1', type: 'group'}))).toBe(true)
        expect(isCatalogReorderDraggable(node({id: 'c1', type: 'connection'}))).toBe(true)
        expect(
            isCatalogReorderDraggable(node({id: EXPLORER_FAVORITES_GROUP_ID, type: 'group'})),
        ).toBe(false)
        expect(isCatalogReorderDraggable(node({id: 't1', type: 'table'}))).toBe(false)
    })

    it('maps pointer Y to before/inside/after for groups', () => {
        expect(resolveCatalogReorderPosition(10, 0, 100, 'group')).toBe('before')
        expect(resolveCatalogReorderPosition(50, 0, 100, 'group')).toBe('inside')
        expect(resolveCatalogReorderPosition(90, 0, 100, 'group')).toBe('after')
    })

    it('maps pointer Y to before/after for connections', () => {
        expect(resolveCatalogReorderPosition(20, 0, 100, 'connection')).toBe('before')
        expect(resolveCatalogReorderPosition(80, 0, 100, 'connection')).toBe('after')
    })

    it('resolves a valid drop between sibling groups', () => {
        const dragged = node({id: 'g1', type: 'group'})
        const target = node({id: 'g2', type: 'group'})
        expect(resolveCatalogReorderDrop(dragged, target, 10, 0, 100)).toEqual({
            targetId: 'g2',
            position: 'before',
        })
        expect(resolveCatalogReorderDrop(dragged, target, 50, 0, 100)).toEqual({
            targetId: 'g2',
            position: 'inside',
        })
    })

    it('rejects dropping onto self or favorites', () => {
        const dragged = node({id: 'g1', type: 'group'})
        expect(resolveCatalogReorderDrop(dragged, dragged, 50, 0, 100)).toBeNull()
        expect(
            resolveCatalogReorderDrop(
                dragged,
                node({id: EXPLORER_FAVORITES_GROUP_ID, type: 'group'}),
                50,
                0,
                100,
            ),
        ).toBeNull()
    })
})
