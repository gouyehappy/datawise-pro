import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    injectProjectConnectionSubmenus,
    listOtherProjects,
    parseMoveToProjectMenuId,
    parseShareToProjectMenuId,
    toMoveToProjectMenuId,
    toShareToProjectMenuId,
} from '@/features/explorer/services/explorer-project-connection.service'
import type {ProjectDto} from '@/features/project/services/project-api'

describe('explorer-project-connection.service', () => {
    it('parses move/share menu ids', () => {
        assert.equal(toMoveToProjectMenuId('proj_a'), 'move-to-project:proj_a')
        assert.equal(parseMoveToProjectMenuId('move-to-project:proj_a'), 'proj_a')
        assert.equal(parseMoveToProjectMenuId('move-to:group'), null)
        assert.equal(toShareToProjectMenuId('proj_b'), 'share-to-project:proj_b')
        assert.equal(parseShareToProjectMenuId('share-to-project:proj_b'), 'proj_b')
    })

    it('lists other non-archived projects', () => {
        const projects: ProjectDto[] = [
            {id: 'proj_default', name: 'Default', archived: false, isDefault: true},
            {id: 'proj_a', name: 'Alpha', archived: false, isDefault: false},
            {id: 'proj_b', name: 'Beta', archived: true, isDefault: false},
        ]
        const others = listOtherProjects(projects, 'proj_default')
        assert.deepEqual(others.map((p) => p.id), ['proj_a'])
    })

    it('injects project submenus after group move', () => {
        const items = injectProjectConnectionSubmenus(
            [{id: 'move', label: 'Move to', icon: 'file'}],
            [{id: 'proj_a', name: 'Alpha', archived: false, isDefault: false}],
            {moveToProject: 'Move to project', shareToProject: 'Share to project'},
        )
        assert.equal(items[0]?.id, 'move')
        assert.equal(items[1]?.id, 'move-to-project')
        assert.equal(items[2]?.id, 'share-to-project')
        assert.equal(items[1]?.children?.[0]?.id, 'move-to-project:proj_a')
    })
})
