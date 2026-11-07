import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {ConnectionConfig} from '@/core/types'
import {
    buildConfigSnapshot,
    isConfigSnapshot,
    parseConfigSnapshotPayload,
    redactConnectionConfig,
} from '@/features/settings/services/config-snapshot.service'

const sample: ConnectionConfig = {
    id: 'c1',
    name: 'Local MySQL',
    dbType: 'mysql',
    env: 'dev',
    storage: 'local',
    host: '127.0.0.1',
    port: '3306',
    auth: 'password',
    user: 'root',
    password: 'secret',
    sshPassword: 'ssh-secret',
    url: 'jdbc:mysql://127.0.0.1:3306/app',
}

describe('config-snapshot.service', () => {
    it('redacts secrets by default and keeps them when opted in', () => {
        const redacted = redactConnectionConfig(sample, false)
        assert.equal(redacted.password, undefined)
        assert.equal(redacted.sshPassword, undefined)
        assert.equal(redacted.user, 'root')
        assert.equal(redactConnectionConfig(sample, true).password, 'secret')
    })

    it('builds and parses a snapshot payload', () => {
        const snapshot = buildConfigSnapshot({
            connections: [sample],
            savedConsoles: [{name: 'q1', connectionName: 'Local MySQL', sql: 'SELECT 1'}],
            includePasswords: false,
            now: new Date('2026-09-18T06:00:00.000Z'),
        })
        assert.equal(isConfigSnapshot(snapshot), true)
        assert.equal(snapshot.includePasswords, false)
        assert.equal(snapshot.connections[0]?.password, undefined)
        assert.equal(snapshot.savedConsoles.length, 1)

        const parsed = parseConfigSnapshotPayload(JSON.stringify(snapshot))
        assert.equal(parsed.connections.length, 1)
        assert.equal(parsed.savedConsoles[0]?.sql, 'SELECT 1')

        const legacy = parseConfigSnapshotPayload(JSON.stringify([sample]))
        assert.equal(legacy.connections.length, 1)
        assert.equal(legacy.savedConsoles.length, 0)
    })
})
