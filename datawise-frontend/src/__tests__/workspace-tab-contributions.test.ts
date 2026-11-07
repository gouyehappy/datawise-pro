import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {defineFeature, registerFeatures, resetFeatureRegistry} from '@/core/feature-contract'
import {
    assertWorkspaceTabContributionsValid,
    resetWorkspaceTabContributionCache,
    resolveWorkspaceTab,
} from '@/features/workspace/tab-registry'

describe('workspace-tab-contributions', () => {
    it('resolves ConfigCenter types from feature contributions', () => {
        resetFeatureRegistry()
        resetWorkspaceTabContributionCache()
        const loader = async () => ({default: {name: 'ConfigCenterWorkbenchTab'}})
        registerFeatures([
            defineFeature({
                id: 'workspace-config-center',
                contributes: {
                    tabs: [
                        {type: 'nacos-configs', loader, asyncName: 'ConfigCenterWorkbenchTab'},
                        {type: 'polaris-services', loader, asyncName: 'ConfigCenterWorkbenchTab'},
                    ],
                },
            }),
        ])
        assertWorkspaceTabContributionsValid()
        const nacos = resolveWorkspaceTab('nacos-configs')
        assert.ok(nacos)
        assert.equal((nacos as {name?: string}).name, 'ConfigCenterWorkbenchTab')
        assert.ok(resolveWorkspaceTab('polaris-services'))
        resetFeatureRegistry()
        resetWorkspaceTabContributionCache()
    })

    it('resolves Yarn and Jenkins types from feature contributions', () => {
        resetFeatureRegistry()
        resetWorkspaceTabContributionCache()
        const yarnLoader = async () => ({default: {name: 'YarnWorkbenchTab'}})
        const jenkinsLoader = async () => ({default: {name: 'JenkinsWorkbenchTab'}})
        registerFeatures([
            defineFeature({
                id: 'workspace-yarn',
                contributes: {
                    tabs: [
                        {type: 'yarn-applications', loader: yarnLoader, asyncName: 'YarnWorkbenchTab'},
                        {type: 'yarn-nodes', loader: yarnLoader, asyncName: 'YarnWorkbenchTab'},
                        {type: 'yarn-queues', loader: yarnLoader, asyncName: 'YarnWorkbenchTab'},
                    ],
                },
            }),
            defineFeature({
                id: 'workspace-jenkins',
                contributes: {
                    tabs: [
                        {type: 'jenkins-jobs', loader: jenkinsLoader, asyncName: 'JenkinsWorkbenchTab'},
                        {type: 'jenkins-nodes', loader: jenkinsLoader, asyncName: 'JenkinsWorkbenchTab'},
                    ],
                },
            }),
        ])
        assertWorkspaceTabContributionsValid()
        assert.equal((resolveWorkspaceTab('yarn-applications') as {name?: string})?.name, 'YarnWorkbenchTab')
        assert.equal((resolveWorkspaceTab('jenkins-jobs') as {name?: string})?.name, 'JenkinsWorkbenchTab')
        resetFeatureRegistry()
        resetWorkspaceTabContributionCache()
    })

    it('resolves Redis / ES / Mongo / Kafka types from feature contributions', () => {
        resetFeatureRegistry()
        resetWorkspaceTabContributionCache()
        const loader = async () => ({default: {}})
        registerFeatures([
            defineFeature({
                id: 'workspace-redis',
                contributes: {
                    tabs: [
                        {type: 'redis-key', loader},
                        {type: 'redis-console', loader},
                    ],
                },
            }),
            defineFeature({
                id: 'workspace-elasticsearch',
                contributes: {tabs: [{type: 'elasticsearch-console', loader}]},
            }),
            defineFeature({
                id: 'workspace-mongo',
                contributes: {tabs: [{type: 'mongo-console', loader}]},
            }),
            defineFeature({
                id: 'workspace-kafka',
                contributes: {
                    tabs: [
                        {type: 'kafka-topics', loader},
                        {type: 'kafka-topic', loader},
                        {type: 'kafka-consumer-groups', loader},
                        {type: 'kafka-table-publish', loader},
                    ],
                },
            }),
        ])
        assertWorkspaceTabContributionsValid()
        assert.ok(resolveWorkspaceTab('redis-key'))
        assert.ok(resolveWorkspaceTab('elasticsearch-console'))
        assert.ok(resolveWorkspaceTab('mongo-console'))
        assert.ok(resolveWorkspaceTab('kafka-table-publish'))
        resetFeatureRegistry()
        resetWorkspaceTabContributionCache()
    })

    it('resolves K8s and SSH types from feature contributions with KeepAlive names', () => {
        resetFeatureRegistry()
        resetWorkspaceTabContributionCache()
        const loader = async () => ({default: {}})
        registerFeatures([
            defineFeature({
                id: 'workspace-kubernetes',
                contributes: {
                    tabs: [
                        {type: 'k8s-pods', loader, asyncName: 'K8sPodsTab'},
                        {type: 'k8s-exec', loader, asyncName: 'K8sExecTab'},
                        {type: 'k8s-helm', loader},
                    ],
                },
            }),
            defineFeature({
                id: 'workspace-ssh',
                contributes: {
                    tabs: [
                        {type: 'ssh-terminal', loader, asyncName: 'SshTerminalTab'},
                        {type: 'ssh-script-record', loader},
                    ],
                },
            }),
        ])
        assertWorkspaceTabContributionsValid()
        assert.equal((resolveWorkspaceTab('k8s-pods') as {name?: string})?.name, 'K8sPodsTab')
        assert.equal((resolveWorkspaceTab('k8s-exec') as {name?: string})?.name, 'K8sExecTab')
        assert.equal((resolveWorkspaceTab('ssh-terminal') as {name?: string})?.name, 'SshTerminalTab')
        assert.ok(resolveWorkspaceTab('ssh-script-record'))
        resetFeatureRegistry()
        resetWorkspaceTabContributionCache()
    })

    it('rejects duplicate tab contributions across features', () => {
        resetFeatureRegistry()
        resetWorkspaceTabContributionCache()
        const loader = async () => ({})
        registerFeatures([
            defineFeature({
                id: 'dup-a',
                contributes: {tabs: [{type: 'console', loader}]},
            }),
            defineFeature({
                id: 'dup-b',
                contributes: {tabs: [{type: 'console', loader}]},
            }),
        ])
        assert.throws(() => assertWorkspaceTabContributionsValid(), /contributed 2 times/)
        assert.throws(() => resolveWorkspaceTab('console'), /contributed 2 times/)
        resetFeatureRegistry()
        resetWorkspaceTabContributionCache()
    })
})
