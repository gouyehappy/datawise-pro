import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    layoutMigrationCanvas,
    nextIncompleteMigrationNode,
    resolveMigrationNodeStatuses,
} from '@/features/workspace/services/migration-canvas.service'

const labels = {
    sourceBadge: 'Source',
    tablesBadge: 'Tables',
    modeBadge: 'Mode',
    targetBadge: 'Target',
    tablesSubtitle: 'Selected tables',
    tablesEmpty: 'None selected',
    targetEmpty: 'Select connection',
    edgeRead: 'Read',
    edgeTables: '{count} tables',
    edgeWrite: 'Write',
}

describe('migration-canvas.service', () => {
    it('resolves node statuses from form completeness', () => {
        const incomplete = resolveMigrationNodeStatuses({
            hasSource: true,
            selectedTableCount: 0,
            targetConnectionId: '',
            targetDatabase: '',
        })
        assert.equal(incomplete.source, 'ready')
        assert.equal(incomplete.tables, 'incomplete')
        assert.equal(incomplete.mode, 'ready')
        assert.equal(incomplete.target, 'incomplete')

        const ready = resolveMigrationNodeStatuses({
            hasSource: true,
            selectedTableCount: 3,
            targetConnectionId: 'c1',
            targetDatabase: 'db',
        })
        assert.equal(ready.tables, 'ready')
        assert.equal(ready.target, 'ready')
    })

    it('layouts source → tables → mode → target left to right', () => {
        const statuses = resolveMigrationNodeStatuses({
            hasSource: true,
            selectedTableCount: 2,
            targetConnectionId: 'c1',
            targetDatabase: 'analytics',
        })
        const layout = layoutMigrationCanvas({
            sourceLabel: 'MySQL@localhost',
            sourceDatabase: 'datadev',
            selectedTableCount: 2,
            modeLabel: 'Full append',
            targetLabel: 'PG@remote',
            targetDatabase: 'analytics',
            labels,
            statuses,
        })
        assert.equal(layout.nodes.length, 4)
        assert.equal(layout.edges.length, 3)
        assert.equal(layout.nodes[0].kind, 'source')
        assert.equal(layout.nodes[1].kind, 'tables')
        assert.equal(layout.nodes[2].kind, 'mode')
        assert.equal(layout.nodes[3].kind, 'target')
        assert.ok(layout.nodes[1].x > layout.nodes[0].x)
        assert.ok(layout.nodes[2].x > layout.nodes[1].x)
        assert.ok(layout.nodes[3].x > layout.nodes[2].x)
        assert.equal(layout.edges[0].label, 'Read')
        assert.equal(layout.edges[1].label, '2 tables')
        assert.equal(layout.edges[2].label, 'Write')
        assert.equal(layout.edges[2].animated, true)
    })

    it('applies position overrides and keeps incomplete target edge unanimated', () => {
        const statuses = resolveMigrationNodeStatuses({
            hasSource: true,
            selectedTableCount: 1,
            targetConnectionId: '',
            targetDatabase: '',
        })
        const layout = layoutMigrationCanvas({
            sourceLabel: 'MySQL',
            sourceDatabase: 'db',
            selectedTableCount: 1,
            modeLabel: 'Full append',
            targetLabel: '',
            targetDatabase: '',
            labels,
            statuses,
            positionOverrides: {
                source: {x: 10, y: 20},
                target: {x: 400, y: 80},
            },
        })
        assert.equal(layout.nodes[0].x, 10)
        assert.equal(layout.nodes[0].y, 20)
        assert.equal(layout.nodes[3].x, 400)
        assert.equal(layout.nodes[3].y, 80)
        assert.equal(layout.edges[2].animated, false)
        assert.equal(layout.nodes[1].subtitle, '1')
        assert.equal(layout.nodes[3].title, 'Select connection')
    })

    it('picks the next incomplete node with preference', () => {
        const statuses = resolveMigrationNodeStatuses({
            hasSource: true,
            selectedTableCount: 0,
            targetConnectionId: '',
            targetDatabase: '',
        })
        assert.equal(nextIncompleteMigrationNode(statuses, 'tables'), 'tables')
        assert.equal(nextIncompleteMigrationNode(statuses, 'mode'), 'tables')

        const almost = resolveMigrationNodeStatuses({
            hasSource: true,
            selectedTableCount: 2,
            targetConnectionId: '',
            targetDatabase: '',
        })
        assert.equal(nextIncompleteMigrationNode(almost, 'tables'), 'target')
    })
})
