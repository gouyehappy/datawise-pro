import assert from 'node:assert/strict'

import {describe, it} from 'node:test'

import {
    isJdbcSshTunnelEnabled,
    isSshTerminalConnection,
    resolveJdbcTunnelSshEndpoint,
    resolveSshTerminalEndpoint,
    supportsJdbcTunnelSshMenu,
} from '@/features/ssh/services/ssh-jdbc-tunnel.service'

describe('ssh-jdbc-tunnel.service', () => {
    it('detects jdbc ssh tunnel connections', () => {
        assert.equal(isJdbcSshTunnelEnabled({
            dbType: 'mysql',
            sshEnabled: true,
            sshHost: '10.0.0.1',
            sshUser: 'ops',
        } as never), true)
        assert.equal(isJdbcSshTunnelEnabled({
            dbType: 'mysql',
            sshEnabled: true,
        } as never), false)
    })

    it('gates jdbc tunnel menu by db type', () => {
        assert.equal(supportsJdbcTunnelSshMenu('mysql'), true)
        assert.equal(supportsJdbcTunnelSshMenu('postgresql'), true)
        assert.equal(supportsJdbcTunnelSshMenu('ssh'), false)
        assert.equal(supportsJdbcTunnelSshMenu('redis'), false)
        assert.equal(supportsJdbcTunnelSshMenu('kafka'), false)
        assert.equal(supportsJdbcTunnelSshMenu('yarn'), false)
        assert.equal(supportsJdbcTunnelSshMenu(undefined), false)
        assert.equal(supportsJdbcTunnelSshMenu(''), false)
    })

    it('resolves tunnel endpoint', () => {
        assert.equal(
            resolveJdbcTunnelSshEndpoint({
                sshUser: 'ops',
                sshHost: '10.0.0.1',
                sshPort: '2222',
            } as never),
            'ops@10.0.0.1:2222',
        )
    })

    it('resolves native ssh and jdbc tunnel endpoints', () => {
        assert.equal(
            resolveSshTerminalEndpoint({
                dbType: 'ssh',
                user: 'root',
                host: '10.0.0.2',
                port: '22',
            } as never),
            'root@10.0.0.2:22',
        )
        assert.equal(
            resolveSshTerminalEndpoint({
                dbType: 'mysql',
                sshEnabled: true,
                sshUser: 'ops',
                sshHost: '10.0.0.1',
                sshPort: '22',
            } as never),
            'ops@10.0.0.1:22',
        )
    })

    it('detects ssh terminal capable connections', () => {
        assert.equal(isSshTerminalConnection({dbType: 'ssh'} as never), true)
        assert.equal(isSshTerminalConnection({
            dbType: 'mysql',
            sshEnabled: true,
            sshHost: '10.0.0.1',
            sshUser: 'ops',
        } as never), true)
        assert.equal(isSshTerminalConnection({dbType: 'mysql'} as never), false)
    })
})
