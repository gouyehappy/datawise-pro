import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildPlatformWorkspaceOpenHandlers,
    dispatchPlatformWorkspaceOpen,
} from '@/features/explorer/services/explorer-platform-menu-actions.service'
import type {useWorkspaceStore} from '@/features/workspace/stores/workspace'

type WorkspaceStore = ReturnType<typeof useWorkspaceStore>

describe('buildPlatformWorkspaceOpenHandlers', () => {
    it('exposes openWithPlan for all platform opens including ssh and kafka publish', () => {
        const calls: string[] = []
        const workspace = {
            openWithPlan: () => {
                calls.push('openWithPlan')
                return 'id'
            },
        } as unknown as WorkspaceStore

        const handlers = buildPlatformWorkspaceOpenHandlers(workspace)
        handlers.openWithPlan((() => ({create: {type: 'yarn-queues', title: 'q', closable: true}})) as never, {
            connectionId: 'c1',
        }, 'yarn')
        dispatchPlatformWorkspaceOpen(
            {kind: 'ssh-terminal'},
            {connectionId: 'c1', connectionName: 'C', explorerNodeId: 'c1'},
            handlers,
        )
        dispatchPlatformWorkspaceOpen(
            {kind: 'kafka-table-publish'},
            {connectionId: 'k1', connectionName: 'K', explorerNodeId: 'k1'},
            handlers,
        )

        assert.deepEqual(calls, ['openWithPlan', 'openWithPlan', 'openWithPlan'])
    })
})
