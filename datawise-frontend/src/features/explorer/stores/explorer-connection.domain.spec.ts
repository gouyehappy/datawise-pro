import {describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import type {TreeNode} from '@/core/types'
import {createExplorerConnectionDomain} from '@/features/explorer/stores/explorer-connection.domain'

vi.mock('@/api', () => ({
    explorerApi: {
        connectConnection: vi.fn(),
        disconnectConnection: vi.fn(),
        reconnectConnection: vi.fn(),
        pingConnection: vi.fn(),
        listPooledConnections: vi.fn(),
        fetchConnection: vi.fn(),
    },
}))

vi.mock('@/features/layout/stores/layout', () => ({
    useLayoutStore: () => ({
        showErrorToast: vi.fn(),
        showWarningToast: vi.fn(),
    }),
}))

vi.mock('@/features/terminal/services/ssh-terminal-session.service', () => ({
    disposeSshTerminalsForConnection: vi.fn(),
    reconnectSshTerminalsForConnection: vi.fn(),
}))

vi.mock('@/features/connection/services/missing-connector-install.service', () => ({
    installMissingConnectorIfNeeded: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/app/services/startup-timing.service', () => ({
    markStartupPhase: vi.fn(),
}))

describe('createExplorerConnectionDomain', () => {
    function makeConn(id: string, dbType = 'mysql'): TreeNode {
        return {
            id,
            label: id,
            type: 'connection',
            dbType,
        }
    }

    it('tracks pooled / reconnect / health helpers without expand', () => {
        const nodes = new Map<string, TreeNode>([['c1', makeConn('c1')]])
        const loadingNodeIds = ref(new Set<string>())
        const resetConnectionTreeState = vi.fn()
        const expandAndLoad = vi.fn().mockResolvedValue(undefined)

        const domain = createExplorerConnectionDomain({
            findNode: (id) => nodes.get(id) ?? null,
            loadingNodeIds,
            resetConnectionTreeState,
            expandAndLoad,
        })

        expect(domain.isConnectionPooled('c1')).toBe(false)
        domain.markConnectionPooled('c1')
        expect(domain.isConnectionPooled('c1')).toBe(true)
        // Pooled + no reachability entry still displays as ok (green badge).
        expect(domain.connectionDisplayHealthById.value).toEqual({c1: 'ok'})

        domain.setConnectionHealth('c1', 'error')
        expect(domain.connectionDisplayHealthById.value).toEqual({c1: 'error'})

        domain.markConnectionNeedsReconnect('c1')
        expect(domain.connectionNeedsReconnect('c1')).toBe(true)
        domain.clearConnectionNeedsReconnect('c1')
        expect(domain.connectionNeedsReconnect('c1')).toBe(false)

        domain.markConnectionAttempted('c1')
        expect(domain.hasAttemptedConnections()).toBe(true)
        domain.pruneAttemptedConnections([])
        expect(domain.hasAttemptedConnections()).toBe(false)
    })

    it('connectConnection marks pooled on successful JDBC connect', async () => {
        const {explorerApi} = await import('@/api')
        vi.mocked(explorerApi.connectConnection).mockResolvedValue({
            ok: true,
            latencyMs: 12,
        })

        const nodes = new Map<string, TreeNode>([['c1', makeConn('c1')]])
        const loadingNodeIds = ref(new Set<string>())
        const expandAndLoad = vi.fn().mockResolvedValue(undefined)

        const domain = createExplorerConnectionDomain({
            findNode: (id) => nodes.get(id) ?? null,
            loadingNodeIds,
            resetConnectionTreeState: vi.fn(),
            expandAndLoad,
        })

        const ok = await domain.connectConnection('c1', {notify: false})
        expect(ok).toBe(true)
        expect(domain.isConnectionPooled('c1')).toBe(true)
        expect(domain.connectionHealthById.value.c1).toBe('ok')
        expect(expandAndLoad).toHaveBeenCalledWith('c1', {notify: false})
        expect(loadingNodeIds.value.has('c1')).toBe(false)
    })

    it('disconnectConnection clears loaded state and marks reconnect for JDBC', async () => {
        const {explorerApi} = await import('@/api')
        vi.mocked(explorerApi.disconnectConnection).mockResolvedValue(undefined as never)

        const nodes = new Map<string, TreeNode>([['c1', makeConn('c1')]])
        const loadingNodeIds = ref(new Set<string>())
        const resetConnectionTreeState = vi.fn()

        const domain = createExplorerConnectionDomain({
            findNode: (id) => nodes.get(id) ?? null,
            loadingNodeIds,
            resetConnectionTreeState,
            expandAndLoad: vi.fn(),
        })

        domain.markConnectionPooled('c1')
        domain.markConnectionAttempted('c1')
        domain.setConnectionHealth('c1', 'ok')

        const ok = await domain.disconnectConnection('c1')
        expect(ok).toBe(true)
        expect(resetConnectionTreeState).toHaveBeenCalledWith('c1')
        expect(domain.isConnectionPooled('c1')).toBe(false)
        expect(domain.connectionNeedsReconnect('c1')).toBe(true)
        expect(domain.hasAttemptedConnections()).toBe(false)
    })
})
