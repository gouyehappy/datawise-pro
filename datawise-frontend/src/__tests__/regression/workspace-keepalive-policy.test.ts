import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    WORKSPACE_KEEPALIVE_INCLUDE,
    WORKSPACE_KEEPALIVE_MAX,
    isWorkspaceSessionStickyType,
} from '@/features/workspace/services/workspace-keepalive.policy'
import {createLazyView} from '@/core/registry/create-lazy-view'

describe('workspace KeepAlive policy', () => {
    it('caches session panes and draft forms; table tabs stay out', () => {
        assert.deepEqual([...WORKSPACE_KEEPALIVE_INCLUDE], [
            'SshTerminalTab',
            'K8sPodsTab',
            'K8sExecTab',
            'YarnWorkbenchTab',
            'JenkinsWorkbenchTab',
            'ConfigCenterWorkbenchTab',
            'ConnectionFormTab',
            'CreateDatabaseTab',
            'LocalTextTab',
        ])
        assert.ok(WORKSPACE_KEEPALIVE_MAX >= WORKSPACE_KEEPALIVE_INCLUDE.length)
        assert.equal(
            WORKSPACE_KEEPALIVE_INCLUDE.includes('TableDetailTab' as (typeof WORKSPACE_KEEPALIVE_INCLUDE)[number]),
            false,
        )
    })

    it('stamps async wrapper name so KeepAlive include can match before resolve', () => {
        const component = createLazyView(async () => ({default: {name: 'SshTerminalTab', setup: () => () => null}}), {
            name: 'SshTerminalTab',
        })
        assert.equal((component as {name?: string}).name, 'SshTerminalTab')
    })

    it('marks session / community types sticky for float shells (no remount)', () => {
        assert.equal(isWorkspaceSessionStickyType('ssh-terminal'), true)
        assert.equal(isWorkspaceSessionStickyType('community-workbench'), true)
        assert.equal(isWorkspaceSessionStickyType('k8s-pods'), true)
        assert.equal(isWorkspaceSessionStickyType('local-text'), true)
        assert.equal(isWorkspaceSessionStickyType('table'), false)
        assert.equal(isWorkspaceSessionStickyType('console'), false)
    })
})
