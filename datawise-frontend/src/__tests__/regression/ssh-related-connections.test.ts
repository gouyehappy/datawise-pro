import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    findRelatedConnections,
    hostsLikelyMatch,
    normalizeHostKey,
} from '@/features/ssh/services/ssh-related-connections.service'
import type {ConnectionsCatalog} from '@/shared/config/connections-catalog.types'

function catalogWithConnections(
    connections: ConnectionsCatalog['connections'],
): ConnectionsCatalog {
    return {
        version: 1,
        groups: [],
        connections,
    }
}

describe('ssh-related-connections.service', () => {
    it('normalizes host keys', () => {
        assert.equal(normalizeHostKey('10.0.0.1:2222'), '10.0.0.1')
        assert.equal(normalizeHostKey('root@10.0.0.1'), '10.0.0.1')
        assert.equal(normalizeHostKey('https://rm.example.com:8088/ws'), 'rm.example.com')
    })

    it('matches hosts across connection config fields', () => {
        assert.equal(hostsLikelyMatch('192.0.2.32', {
            id: 'yarn-1',
            name: 'YARN',
            dbType: 'yarn',
            env: 'prod',
            storage: 'local',
            host: '192.0.2.32',
            port: '8088',
            auth: 'none',
            url: '',
        }), true)
    })

    it('finds yarn and kafka links on same host', () => {
        const catalog = catalogWithConnections([
            {
                id: 'ssh-1',
                groupId: 'g1',
                sortOrder: 0,
                config: {
                    id: 'ssh-1',
                    name: 'SSH',
                    dbType: 'ssh',
                    env: 'prod',
                    storage: 'local',
                    host: '192.0.2.32',
                    port: '22',
                    auth: 'password',
                    url: '',
                },
            },
            {
                id: 'yarn-1',
                groupId: 'g1',
                sortOrder: 1,
                config: {
                    id: 'yarn-1',
                    name: 'Cluster YARN',
                    dbType: 'yarn',
                    env: 'prod',
                    storage: 'local',
                    host: '192.0.2.32',
                    port: '8088',
                    auth: 'none',
                    url: '',
                },
            },
            {
                id: 'kafka-1',
                groupId: 'g1',
                sortOrder: 2,
                config: {
                    id: 'kafka-1',
                    name: 'Kafka',
                    dbType: 'kafka',
                    env: 'prod',
                    storage: 'local',
                    host: '192.0.2.32:9092',
                    port: '9092',
                    auth: 'none',
                    url: '',
                },
            },
        ])

        const related = findRelatedConnections('192.0.2.32', catalog, {sshConnectionId: 'ssh-1'})
        assert.ok(related.some((item) => item.connectionId === 'yarn-1' && item.kind === 'yarn-apps'))
        assert.ok(related.some((item) => item.connectionId === 'kafka-1' && item.kind === 'kafka-topics'))
    })
})
