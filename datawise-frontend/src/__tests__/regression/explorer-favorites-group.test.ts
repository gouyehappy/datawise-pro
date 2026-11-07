import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode} from '@/core/types'
import {EXPLORER_FAVORITES_VIEW_ALL_ID} from '@/features/explorer/services/explorer-favorites.constants'
import {buildExplorerFavoritesGroup} from '@/features/explorer/services/explorer-favorites-group.service'
import type {PinnedTableFavorite} from '@/features/explorer/services/pinned-table-favorites.service'

const labels = {
    group: 'Favorites',
    viewAll: (count: number) => `View all (${count})`,
    tableSubtitle: (favorite: PinnedTableFavorite) => `${favorite.connectionLabel} · ${favorite.database}`,
}

function favorite(index: number): PinnedTableFavorite {
    return {
        nodeId: `tbl-${index}`,
        connectionId: 'conn-1',
        database: 'app',
        tableName: `table_${index}`,
        connectionLabel: 'Local MySQL',
        dbType: 'mysql',
    }
}

describe('explorer-favorites-group.service', () => {
    it('returns null when there are no favorites', () => {
        const group = buildExplorerFavoritesGroup([], [], labels, {expanded: true, showAll: false})
        assert.equal(group, null)
    })

    it('shows up to 8 tables and a view-all row when collapsed', () => {
        const favorites = Array.from({length: 10}, (_, index) => favorite(index + 1))
        const group = buildExplorerFavoritesGroup([], favorites, labels, {expanded: true, showAll: false})
        assert.ok(group)
        assert.equal(group?.children?.length, 9)
        assert.equal(group?.children?.[7]?.id, 'tbl-8')
        assert.equal(group?.children?.[8]?.id, EXPLORER_FAVORITES_VIEW_ALL_ID)
        assert.match(group?.children?.[8]?.label ?? '', /View all \(10\)/)
    })

    it('shows all favorites when showAll is true', () => {
        const favorites = Array.from({length: 10}, (_, index) => favorite(index + 1))
        const group = buildExplorerFavoritesGroup([], favorites, labels, {expanded: true, showAll: true})
        assert.equal(group?.children?.length, 10)
        assert.equal(group?.children?.some((child) => child.id === EXPLORER_FAVORITES_VIEW_ALL_ID), false)
    })

    it('uses live tree node labels when the table is loaded', () => {
        const tree: TreeNode[] = [
            {
                id: 'conn-1',
                label: 'Local MySQL',
                type: 'connection',
                dbType: 'mysql',
                children: [
                    {
                        id: 'db-1',
                        label: 'app',
                        type: 'database',
                        children: [
                            {
                                id: 'folder-tables',
                                label: 'tables',
                                type: 'folder',
                                children: [
                                    {id: 'tbl-1', label: 'users', type: 'table'},
                                ],
                            },
                        ],
                    },
                ],
            },
        ]
        const group = buildExplorerFavoritesGroup(
            tree,
            [favorite(1)],
            labels,
            {expanded: true, showAll: false},
        )
        assert.equal(group?.children?.[0]?.label, 'users')
    })
})
