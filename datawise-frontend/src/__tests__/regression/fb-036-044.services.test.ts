import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildConnectionAccessMap,
    canDmlConnection,
    canDdlConnection,
    normalizeStoredAccess,
    requiresDdlAccess,
    requiresWriteAccess,
    resolveConnectionAccess,
    toStoredConnectionAccess,
} from '@/features/team/services/connection-access.service'
import {formatDurationMs, truncateSql} from '@/features/workspace/services/sql-stats.service'
import type {TeamSummary} from '@/core/types'

describe('connection-access.service', () => {
    const teams: TeamSummary[] = [
        {
            id: 'team-1',
            name: 'A',
            memberCount: 2,
            role: 'member',
            sharedConnectionIds: ['conn-1', 'conn-2', 'conn-3'],
            sharedConnectionAccess: { 'conn-1': 'read', 'conn-2': 'readwrite' },
        },
    ]

    it('allows ddl on non-shared connections', () => {
        assert.equal(resolveConnectionAccess('conn-private', teams), 'ddl')
    })

    it('respects readonly and readwrite access for members', () => {
        assert.equal(resolveConnectionAccess('conn-1', teams), 'readonly')
        assert.equal(resolveConnectionAccess('conn-2', teams), 'readwrite')
        assert.equal(resolveConnectionAccess('conn-3', teams), 'ddl')
    })

    it('viewer is always readonly on shared connections', () => {
        const viewerTeams: TeamSummary[] = [{...teams[0], role: 'viewer'}]
        assert.equal(resolveConnectionAccess('conn-3', viewerTeams), 'readonly')
    })

    it('maps legacy read/write storage values', () => {
        assert.equal(normalizeStoredAccess('read'), 'readonly')
        assert.equal(normalizeStoredAccess('write'), 'ddl')
    })

    it('detects write and ddl SQL', () => {
        assert.equal(requiresWriteAccess('SELECT 1'), false)
        assert.equal(requiresWriteAccess('UPDATE t SET a = 1'), true)
        assert.equal(requiresDdlAccess('CREATE TABLE t (id INT)'), true)
        assert.equal(requiresDdlAccess('UPDATE t SET a = 1'), false)
    })

    it('checks dml vs ddl capability helpers', () => {
        assert.equal(canDmlConnection('conn-1', teams), false)
        assert.equal(canDmlConnection('conn-2', teams), true)
        assert.equal(canDmlConnection('new-123456', teams), false)
        assert.equal(canDdlConnection('conn-2', teams), false)
        assert.equal(canDdlConnection('conn-3', teams), true)
    })

    it('builds access map and stores only non-default levels', () => {
        assert.deepEqual(
            buildConnectionAccessMap(['a', 'b'], {a: 'read', b: 'readwrite'}),
            {a: 'readonly', b: 'readwrite'},
        )
        assert.deepEqual(
            toStoredConnectionAccess({a: 'readonly', b: 'readwrite', c: 'ddl'}),
            {a: 'readonly', b: 'readwrite'},
        )
    })
})

describe('sql-stats.service', () => {
    it('formats duration', () => {
        assert.equal(formatDurationMs(500), '500ms')
        assert.equal(formatDurationMs(1500), '1.5s')
    })

    it('truncates long SQL', () => {
        const sql = 'SELECT ' + 'x'.repeat(200)
        assert.equal(truncateSql(sql, 40).endsWith('…'), true)
    })
})
