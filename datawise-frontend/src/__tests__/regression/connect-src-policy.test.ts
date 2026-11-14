import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    CONNECT_SRC_BASE,
    connectSrcExtrasForRemoteApi,
    resolveConnectSrcDirectives,
} from '@/shared/security/connect-src-policy'

describe('connect-src-policy', () => {
    it('derives https origin and wss host for remote API', () => {
        assert.deepEqual(
            connectSrcExtrasForRemoteApi('https://api.example.com:8443/path'),
            ['https://api.example.com:8443', 'wss://api.example.com:8443'],
        )
    })

    it('derives http origin and ws host for remote API', () => {
        assert.deepEqual(
            connectSrcExtrasForRemoteApi('http://192.168.1.10:8080'),
            ['http://192.168.1.10:8080', 'ws://192.168.1.10:8080'],
        )
    })

    it('keeps localhost base without bare https wildcard', () => {
        const directives = resolveConnectSrcDirectives({mode: 'local', remoteUrl: ''})
        assert.deepEqual(directives, [...CONNECT_SRC_BASE])
        assert.equal(directives.includes('https:'), false)
        assert.equal(directives.includes('wss:'), false)
    })

    it('appends remote extras in remote mode', () => {
        const directives = resolveConnectSrcDirectives({
            mode: 'remote',
            remoteUrl: 'https://cloud.example.com',
        })
        assert.ok(directives.includes('https://cloud.example.com'))
        assert.ok(directives.includes('wss://cloud.example.com'))
    })
})
