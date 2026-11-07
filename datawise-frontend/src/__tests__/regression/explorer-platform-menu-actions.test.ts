import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    dispatchPlatformWorkspaceOpen,
    resolveNewSshTerminalConnectionId,
    resolvePlatformConnectionMenuOpen,
    resolvePlatformFeatureNodeOpen,
    type PlatformWorkspaceOpenHandlers,
} from '@/features/explorer/services/explorer-platform-menu-actions.service'

function createHandlers() {
    const calls: Array<{name: string; args: unknown}> = []
    const handlers: PlatformWorkspaceOpenHandlers = {
        openWithPlan: (plan, options, kind) => {
            calls.push({name: 'openWithPlan', args: {plan: plan.name || 'plan', options, kind}})
            return 'tab-id'
        },
    }
    return {calls, handlers}
}

describe('explorer-platform-menu-actions.service', () => {
    it('maps redis / kafka / yarn / jenkins open actions', () => {
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('open-redis-keys', {type: 'connection', dbType: 'redis'}),
            {kind: 'redis-console', view: 'keys'},
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('open-redis-command', {type: 'connection', dbType: 'redis'}),
            {kind: 'redis-console', view: 'command'},
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('redis-console', {type: 'connection', dbType: 'redis'}),
            {kind: 'redis-console', view: 'keys'},
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('open-kafka-topics', {type: 'connection', dbType: 'kafka'}),
            {kind: 'kafka-topics'},
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('kafka-console', {type: 'connection', dbType: 'kafka'}),
            {kind: 'kafka-topics'},
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('open-yarn-queues', {type: 'connection', dbType: 'yarn'}),
            {kind: 'yarn-queues'},
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('open-jenkins-jobs', {type: 'connection', dbType: 'jenkins'}),
            {kind: 'jenkins-jobs'},
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('open-nacos-configs', {type: 'connection', dbType: 'nacos'}),
            {kind: 'nacos-configs'},
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('open-nacos-services', {type: 'connection', dbType: 'nacos'}),
            {kind: 'nacos-services'},
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('open-polaris-services', {type: 'connection', dbType: 'polaris'}),
            {kind: 'polaris-services'},
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('open-polaris-configs', {type: 'connection', dbType: 'polaris'}),
            {kind: 'polaris-configs'},
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('open-k8s-pods', {type: 'connection', dbType: 'kubernetes'}),
            {kind: 'k8s-pods'},
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('open-k8s-deployments', {type: 'connection', dbType: 'kubernetes'}),
            {kind: 'k8s-deployments'},
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('open-k8s-apply', {type: 'connection', dbType: 'kubernetes'}),
            {kind: 'k8s-apply'},
        )
    })

    it('gates by node type and dbType', () => {
        assert.equal(
            resolvePlatformConnectionMenuOpen('open-redis-keys', {type: 'database', dbType: 'redis'}),
            null,
        )
        assert.equal(
            resolvePlatformConnectionMenuOpen('open-redis-keys', {type: 'connection', dbType: 'mysql'}),
            null,
        )
        assert.equal(
            resolvePlatformConnectionMenuOpen('open', {type: 'connection', dbType: 'redis'}),
            null,
        )
    })

    it('handles ssh terminal open variants', () => {
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('open-ssh-terminal', {type: 'connection', dbType: 'ssh'}),
            {kind: 'ssh-terminal'},
        )
        // JDBC tunnel: connection only, no ssh dbType required
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('open-jdbc-ssh-tunnel', {type: 'connection', dbType: 'mysql'}),
            {kind: 'ssh-terminal'},
        )
        assert.equal(
            resolvePlatformConnectionMenuOpen('open-jdbc-ssh-tunnel', {type: 'database', dbType: 'mysql'}),
            null,
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('new-ssh-terminal', {type: 'connection', dbType: 'ssh'}),
            {kind: 'ssh-terminal-new'},
        )
        assert.deepEqual(
            resolvePlatformConnectionMenuOpen('new-ssh-terminal', {type: 'ssh-terminal', dbType: 'ssh'}),
            {kind: 'ssh-terminal-new'},
        )
        assert.equal(
            resolvePlatformConnectionMenuOpen('new-ssh-terminal', {type: 'connection', dbType: 'mysql'}),
            null,
        )
    })

    it('resolves new-ssh-terminal connection id', () => {
        assert.equal(
            resolveNewSshTerminalConnectionId({type: 'connection', id: 'c1'}, 'parent'),
            'c1',
        )
        assert.equal(
            resolveNewSshTerminalConnectionId({type: 'ssh-terminal', id: 'c1:ssh:terminal'}, 'c1'),
            'c1',
        )
        assert.equal(
            resolveNewSshTerminalConnectionId({type: 'ssh-terminal', id: 'c1:ssh:terminal'}, undefined),
            '',
        )
    })

    it('maps platform feature tree node opens', () => {
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({type: 'redis-feature', label: 'keys', meta: 'keys'}),
            {kind: 'redis-console', view: 'keys'},
        )
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({type: 'kafka-feature', label: 'topics', meta: 'topics'}),
            {kind: 'kafka-topics'},
        )
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({
                type: 'kafka-feature',
                label: 'table-publish',
                meta: 'table-publish',
            }),
            {kind: 'kafka-table-publish'},
        )
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({type: 'yarn-feature', label: 'queues', meta: 'queues'}),
            {kind: 'yarn-queues'},
        )
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({type: 'jenkins-feature', label: 'jobs', meta: 'jobs'}),
            {kind: 'jenkins-jobs'},
        )
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({type: 'nacos-feature', label: 'configs', meta: 'configs'}),
            {kind: 'nacos-configs'},
        )
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({type: 'nacos-feature', label: 'services', meta: 'services'}),
            {kind: 'nacos-services'},
        )
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({type: 'nacos-namespace', label: 'dev', meta: 'dev-id'}),
            {kind: 'nacos-configs', namespace: 'dev-id'},
        )
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({type: 'nacos-namespace', label: 'public', meta: 'public'}),
            {kind: 'nacos-configs', namespace: ''},
        )
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({type: 'polaris-feature', label: 'services', meta: 'services'}),
            {kind: 'polaris-services'},
        )
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({type: 'polaris-feature', label: 'configs', meta: 'configs'}),
            {kind: 'polaris-configs'},
        )
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({type: 'k8s-feature', label: 'pods', meta: 'pods'}),
            {kind: 'k8s-pods'},
        )
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({type: 'k8s-feature', label: 'deployments', meta: 'deployments'}),
            {kind: 'k8s-deployments'},
        )
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({type: 'k8s-feature', label: 'secrets', meta: 'secrets'}),
            {kind: 'k8s-secrets'},
        )
        assert.deepEqual(
            resolvePlatformFeatureNodeOpen({type: 'k8s-feature', label: 'helm', meta: 'helm'}),
            {kind: 'k8s-helm'},
        )
        assert.equal(resolvePlatformFeatureNodeOpen({type: 'table', label: 't'}), null)
    })

    it('dispatchPlatformWorkspaceOpen routes kinds to handlers', () => {
        const ctx = {connectionId: 'c1', connectionName: 'Conn', explorerNodeId: 'c1'}
        const redis = createHandlers()
        dispatchPlatformWorkspaceOpen({kind: 'redis-console', view: 'command'}, ctx, redis.handlers)
        assert.equal(redis.calls.length, 1)
        assert.equal(redis.calls[0].name, 'openWithPlan')
        assert.deepEqual((redis.calls[0].args as {kind: string; options: unknown}).kind, 'redis')
        assert.deepEqual((redis.calls[0].args as {options: unknown}).options, {...ctx, view: 'command'})

        const kafka = createHandlers()
        dispatchPlatformWorkspaceOpen({kind: 'kafka-table-publish'}, ctx, kafka.handlers)
        assert.equal(kafka.calls.length, 1)
        assert.equal(kafka.calls[0].name, 'openWithPlan')
        assert.deepEqual((kafka.calls[0].args as {kind: string; options: unknown}).kind, 'kafka')
        assert.deepEqual((kafka.calls[0].args as {options: unknown}).options, ctx)

        const ssh = createHandlers()
        dispatchPlatformWorkspaceOpen({kind: 'ssh-terminal-new'}, ctx, ssh.handlers)
        assert.equal(ssh.calls.length, 1)
        assert.equal(ssh.calls[0].name, 'openWithPlan')
        assert.deepEqual((ssh.calls[0].args as {kind: string; options: unknown}).kind, 'ssh')
        assert.deepEqual((ssh.calls[0].args as {options: unknown}).options, ctx)

        const yarn = createHandlers()
        dispatchPlatformWorkspaceOpen({kind: 'yarn-queues'}, ctx, yarn.handlers)
        assert.equal(yarn.calls.length, 1)
        assert.equal(yarn.calls[0].name, 'openWithPlan')
        assert.deepEqual((yarn.calls[0].args as {kind: string; options: unknown}).kind, 'yarn')
        assert.deepEqual((yarn.calls[0].args as {options: unknown}).options, ctx)

        const k8s = createHandlers()
        dispatchPlatformWorkspaceOpen({kind: 'k8s-pods', namespace: 'default'}, ctx, k8s.handlers)
        assert.equal(k8s.calls[0].name, 'openWithPlan')
        assert.deepEqual((k8s.calls[0].args as {kind: string}).kind, 'kubernetes')
    })
})
