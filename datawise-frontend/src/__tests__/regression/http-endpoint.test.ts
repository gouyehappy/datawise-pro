import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {buildJdbcUrl} from '@/features/connection/utils/jdbc-url.ts'
import {
    applyParsedHttpEndpoint,
    formatHttpEndpoint,
    parseHttpEndpoint,
} from '@/features/connection/utils/http-endpoint.ts'

describe('http endpoint paste', () => {
    it('parses a Jenkins login URL into host, port, and context path', () => {
        assert.deepEqual(parseHttpEndpoint('http://192.0.2.30:8082/jenkins/login', 'jenkins'), {
            host: '192.0.2.30',
            port: '8082',
            https: false,
            path: '/jenkins',
        })
        assert.equal(
            formatHttpEndpoint('jenkins', '192.0.2.30', '8082', 'contextPath=/jenkins'),
            'http://192.0.2.30:8082/jenkins',
        )
        assert.equal(
            buildJdbcUrl('jenkins', '192.0.2.30', '8082', {advancedConfig: 'contextPath=/jenkins'}),
            'http://192.0.2.30:8082/jenkins',
        )
    })

    it('maps a YARN UI cluster path to the REST base', () => {
        assert.equal(
            parseHttpEndpoint('http://rm.example.com:8088/cluster/apps', 'yarn')?.path,
            '/ws/v1/cluster',
        )
        const applied = applyParsedHttpEndpoint(
            'yarn',
            parseHttpEndpoint('https://rm.example.com:8088/cluster', 'yarn')!,
            {host: 'localhost', port: '8088', advancedConfig: ''},
        )
        assert.equal(applied.host, 'rm.example.com')
        assert.equal(applied.port, '8088')
        assert.match(applied.advancedConfig, /useHttps=true/)
        assert.match(applied.advancedConfig, /restPath=\/ws\/v1\/cluster/)
    })

    it('parses Kubernetes and Polaris console URLs', () => {
        assert.deepEqual(parseHttpEndpoint('https://k8s.example.com:6443', 'kubernetes'), {
            host: 'k8s.example.com',
            port: '6443',
            https: true,
            path: '/',
        })
        assert.equal(
            formatHttpEndpoint('kubernetes', 'k8s.example.com', '6443', 'useHttps=true'),
            'https://k8s.example.com:6443',
        )
        assert.equal(
            formatHttpEndpoint('polaris', '127.0.0.1', '8090', ''),
            'http://127.0.0.1:8090',
        )
    })
})
