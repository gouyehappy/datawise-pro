import assert from 'node:assert/strict'

import {describe, it} from 'node:test'

import {
    buildYarnLogsCommand,
    extractFirstYarnAppId,
    extractYarnAppIds,
    findSshConnectionForHost,
} from '@/features/ssh/services/ssh-yarn-bridge.service'

describe('ssh-yarn-bridge.service', () => {
    it('extracts yarn application ids from text', () => {
        const text = 'Application application_1700000000000_0001 finished'
        assert.deepEqual(extractYarnAppIds(text), ['application_1700000000000_0001'])
        assert.equal(extractFirstYarnAppId(text), 'application_1700000000000_0001')
    })

    it('builds yarn logs command', () => {
        assert.equal(
            buildYarnLogsCommand('application_1_2', 100),
            'yarn logs -applicationId application_1_2 2>/dev/null | tail -n 100',
        )
    })

    it('finds ssh connection by host', () => {
        const match = findSshConnectionForHost('192.0.2.51', {
            connections: [
                {
                    id: 'ssh-1',
                    config: {
                        name: 'Node51',
                        dbType: 'ssh',
                        host: '192.0.2.51',
                    },
                },
                {
                    id: 'yarn-1',
                    config: {
                        name: 'YARN',
                        dbType: 'yarn',
                        host: '192.0.2.51:8088',
                    },
                },
            ],
        } as never)
        assert.equal(match?.connectionId, 'ssh-1')
    })
})
