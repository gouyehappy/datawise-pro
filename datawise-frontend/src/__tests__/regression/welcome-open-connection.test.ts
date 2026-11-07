import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {resolveWelcomePrimaryOpen} from '@/features/workspace/services/welcome-open-connection.service'

describe('welcome-open-connection', () => {
    it('routes tool connections to platform workbenches instead of SQL', () => {
        assert.deepEqual(resolveWelcomePrimaryOpen('plugin'), {mode: 'plugin'})
        assert.deepEqual(resolveWelcomePrimaryOpen('mongodb'), {mode: 'mongo'})

        const ssh = resolveWelcomePrimaryOpen('ssh')
        assert.equal(ssh.mode, 'platform')
        if (ssh.mode === 'platform') assert.equal(ssh.open.kind, 'ssh-terminal')

        const yarn = resolveWelcomePrimaryOpen('yarn')
        assert.equal(yarn.mode, 'platform')
        if (yarn.mode === 'platform') assert.equal(yarn.open.kind, 'yarn-applications')

        const k8s = resolveWelcomePrimaryOpen('kubernetes')
        assert.equal(k8s.mode, 'platform')
        if (k8s.mode === 'platform') assert.equal(k8s.open.kind, 'k8s-pods')

        const es = resolveWelcomePrimaryOpen('elasticsearch')
        assert.equal(es.mode, 'platform')
        if (es.mode === 'platform') {
            assert.equal(es.open.kind, 'elasticsearch-console')
            if (es.open.kind === 'elasticsearch-console') assert.equal(es.open.view, 'documents')
        }

        const redis = resolveWelcomePrimaryOpen('redis')
        assert.equal(redis.mode, 'platform')
        if (redis.mode === 'platform') assert.equal(redis.open.kind, 'redis-console')

        const kafka = resolveWelcomePrimaryOpen('kafka')
        assert.equal(kafka.mode, 'platform')
        if (kafka.mode === 'platform') assert.equal(kafka.open.kind, 'kafka-topics')
    })

    it('keeps JDBC sources on SQL console', () => {
        assert.deepEqual(resolveWelcomePrimaryOpen('mysql'), {mode: 'sql'})
        assert.deepEqual(resolveWelcomePrimaryOpen('postgresql'), {mode: 'sql'})
    })
})
