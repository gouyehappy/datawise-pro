/**
 * Explorer connection lifecycle domain (FE-P0-3 store Phase A).
 * Factory over shared store refs — `useExplorerStore` remains the public facade.
 */
import {computed, ref, type Ref} from 'vue'
import type {TreeNode} from '@/core/types'
import {logPerf, perfNow} from '@/core/utils/perf-log'
import {markStartupPhase} from '@/app/services/startup-timing.service'
import {explorerApi} from '@/api'
import {isJdbcDriverError, resolveConnectionErrorMessage} from '@/features/explorer/services/connection-error-message'
import {installMissingConnectorIfNeeded} from '@/features/connection/services/missing-connector-install.service'
import {jdbcArtifactName, useDriverInstallStore} from '@/features/connection/stores/driver-install'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {
    buildConnectionDisplayHealthMap,
    mergePooledConnectionSync,
    usesConnectionReconnectOverlay,
    usesPeriodicConnectionHealthProbe,
} from '@/features/explorer/services/explorer-connection-state.service'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {
    disposeSshTerminalsForConnection,
    reconnectSshTerminalsForConnection,
} from '@/features/terminal/services/ssh-terminal-session.service'
import {
    EXPLORER_HEALTH_PROBE_CONCURRENCY,
    runWithConcurrencyLimit,
} from '@/core/utils/concurrency-limit'

export type ExplorerConnectionDomainDeps = {
    findNode: (nodeId: string) => TreeNode | null
    loadingNodeIds: Ref<Set<string>>
    /** Late-bound: tree/etag reset lives in the store facade. */
    resetConnectionTreeState: (connectionId: string) => void
    /** Late-bound: expand path uses lazy-load which may call connect. */
    expandAndLoad: (
        nodeId: string,
        options?: {load?: boolean; notify?: boolean},
    ) => Promise<void>
}

export function createExplorerConnectionDomain(deps: ExplorerConnectionDomainDeps) {
    const connectionHealthById = ref<Record<string, 'ok' | 'error'>>({})
    /** 后端仍保持温热 JDBC 池的连接（绿标 / 已连接状态以此为准，与 ping 可达性分离） */
    const pooledConnectionIds = ref<Set<string>>(new Set())
    /** 连接已从服务端释放，打开的工作区 Tab 需遮罩提示重新连接 */
    const needsReconnectConnectionIds = ref<Set<string>>(new Set())
    /** 用户已点击/展开过的连接，仅这些连接参与健康检查 */
    const attemptedConnectionIds = ref<Set<string>>(new Set())
    const connectionHealthChecking = ref(false)
    const connectionHealthCheckedAt = ref<number | null>(null)

    const connectionDisplayHealthById = computed(() =>
        buildConnectionDisplayHealthMap(pooledConnectionIds.value, connectionHealthById.value),
    )

    function isConnectionPooled(connectionId: string) {
        return pooledConnectionIds.value.has(connectionId)
    }

    function connectionNeedsReconnect(connectionId: string | undefined | null): boolean {
        if (!connectionId) return false
        if (!needsReconnectConnectionIds.value.has(connectionId)) return false
        const dbType = deps.findNode(connectionId)?.dbType
        return usesConnectionReconnectOverlay(dbType)
    }

    function markConnectionNeedsReconnect(connectionId: string) {
        if (!connectionId) return
        const dbType = deps.findNode(connectionId)?.dbType
        if (!usesConnectionReconnectOverlay(dbType)) return
        if (!needsReconnectConnectionIds.value.has(connectionId)) {
            needsReconnectConnectionIds.value = new Set([
                ...needsReconnectConnectionIds.value,
                connectionId,
            ])
        }
        void disposeSshTerminalsForConnection(connectionId)
    }

    function clearConnectionNeedsReconnect(connectionId: string) {
        if (!needsReconnectConnectionIds.value.has(connectionId)) return
        const next = new Set(needsReconnectConnectionIds.value)
        next.delete(connectionId)
        needsReconnectConnectionIds.value = next
    }

    function markConnectionPooled(connectionId: string) {
        if (pooledConnectionIds.value.has(connectionId)) return
        pooledConnectionIds.value = new Set([...pooledConnectionIds.value, connectionId])
    }

    function unmarkConnectionPooled(connectionId: string) {
        if (!pooledConnectionIds.value.has(connectionId)) return
        const next = new Set(pooledConnectionIds.value)
        next.delete(connectionId)
        pooledConnectionIds.value = next
    }

    function setConnectionHealth(connectionId: string, health: 'ok' | 'error' | null) {
        if (!health) {
            if (!(connectionId in connectionHealthById.value)) return
            const next = {...connectionHealthById.value}
            delete next[connectionId]
            connectionHealthById.value = next
            return
        }
        connectionHealthById.value = {...connectionHealthById.value, [connectionId]: health}
    }

    function markConnectionAttempted(connectionId: string) {
        if (attemptedConnectionIds.value.has(connectionId)) return
        attemptedConnectionIds.value = new Set([...attemptedConnectionIds.value, connectionId])
    }

    function hasAttemptedConnections() {
        return attemptedConnectionIds.value.size > 0
    }

    function pruneAttemptedConnections(validIds: readonly string[]) {
        const valid = new Set(validIds)
        attemptedConnectionIds.value = new Set(
            [...attemptedConnectionIds.value].filter((id) => valid.has(id)),
        )
    }

    async function reportConnectionFailure(connectionId: string, error: unknown, options?: {
        notify?: boolean
        retry?: () => Promise<boolean>
    }) {
        if (options?.notify !== true) return
        const node = deps.findNode(connectionId)
        const installed = await installMissingConnectorIfNeeded(error, {
            fallbackDbType: node?.dbType ?? '',
        })
        if (installed && options.retry) {
            const ok = await options.retry()
            if (ok) return
        }
        if (!installed && isJdbcDriverError(error) && node?.dbType) {
            const catalog = useDatasourceCatalogStore()
            const item = catalog.items.find((entry) => entry.id === node.dbType)
            const maven = item?.defaultDriverMaven?.trim() ?? ''
            const driverClass = item?.defaultDriverClass?.trim() ?? ''
            if (maven && driverClass && item?.jdbcDriverRequired) {
                const outcome = await useDriverInstallStore().ensure(
                    maven,
                    driverClass,
                    item.label || jdbcArtifactName(maven),
                )
                if ((outcome === 'installed' || outcome === 'cached') && options.retry) {
                    const ok = await options.retry()
                    if (ok) return
                }
                if (outcome === 'failed' || outcome === 'cancelled') return
            }
        }
        if (!installed) {
            useLayoutStore().showErrorToast(resolveConnectionErrorMessage(error))
        }
    }

    async function probeAllConnectionHealth() {
        if (connectionHealthChecking.value) return
        const ids = [...pooledConnectionIds.value].filter((connectionId) => {
            const dbType = deps.findNode(connectionId)?.dbType
            return usesPeriodicConnectionHealthProbe(dbType)
        })
        connectionHealthChecking.value = true
        try {
            if (!ids.length) {
                return
            }
            await runWithConcurrencyLimit(ids, EXPLORER_HEALTH_PROBE_CONCURRENCY, async (connectionId) => {
                try {
                    const result = await explorerApi.pingConnection(connectionId)
                    setConnectionHealth(connectionId, result.ok ? 'ok' : 'error')
                } catch {
                    setConnectionHealth(connectionId, 'error')
                }
            })
            connectionHealthCheckedAt.value = Date.now()
        } finally {
            connectionHealthChecking.value = false
        }
    }

    function handleServerIdleDisconnect(connectionId: string, options?: {notify?: boolean}) {
        const node = deps.findNode(connectionId)
        if (!node || node.type !== 'connection') return
        if (!usesConnectionReconnectOverlay(node.dbType)) {
            // Stateless: no pool to release; keep green badge while tab is open / in use.
            return
        }
        deps.resetConnectionTreeState(connectionId)
        setConnectionHealth(connectionId, null)
        unmarkConnectionPooled(connectionId)
        markConnectionNeedsReconnect(connectionId)
        // 空闲断开由 reconnect overlay / 树状态表达，不再弹 toast。
        void options?.notify
    }

    function clearConnectionLoadedState(connectionId: string) {
        deps.resetConnectionTreeState(connectionId)
        setConnectionHealth(connectionId, null)
        unmarkConnectionPooled(connectionId)
        if (attemptedConnectionIds.value.has(connectionId)) {
            attemptedConnectionIds.value = new Set(
                [...attemptedConnectionIds.value].filter((id) => id !== connectionId),
            )
        }
    }

    async function syncPooledConnectionState(options?: {notifyIdleDisconnect?: boolean}) {
        try {
            const pooled = await explorerApi.listPooledConnections()
            const prevPooled = pooledConnectionIds.value
            let openTabConnectionIds = new Set<string>()
            try {
                const {useWorkspaceStore} = await import('@/features/workspace/stores/workspace')
                for (const tab of useWorkspaceStore().tabs) {
                    if (tab.connectionId) openTabConnectionIds.add(tab.connectionId)
                }
            } catch {
                // workspace may not be mounted yet during startup
            }
            const {nextPooledIds, evictedIds} = mergePooledConnectionSync({
                serverPooledIds: pooled,
                previousPooledIds: prevPooled,
                resolveDbType: (connectionId) => deps.findNode(connectionId)?.dbType,
                isUiConnected: (connectionId) => connectionHealthById.value[connectionId] === 'ok',
                isConnectionInUse: (connectionId) =>
                    attemptedConnectionIds.value.has(connectionId)
                    || openTabConnectionIds.has(connectionId),
            })
            pooledConnectionIds.value = nextPooledIds

            for (const connectionId of evictedIds) {
                handleServerIdleDisconnect(connectionId, {
                    notify: options?.notifyIdleDisconnect,
                })
            }
        } catch {
            // best effort: backend may be offline during startup
        }
    }

    async function disconnectConnection(connectionId: string): Promise<boolean> {
        const node = deps.findNode(connectionId)
        if (!node || node.type !== 'connection') return false
        try {
            if (node.dbType === 'plugin') {
                const config = await explorerApi.fetchConnection(connectionId)
                const {createHttpCommunityPluginsApi} = await import('@/shared/api/http/community-plugins')
                await createHttpCommunityPluginsApi().disconnect(config)
                // Community plugins own their workbench session; no JDBC reconnect overlay.
                clearConnectionLoadedState(connectionId)
                return true
            }
            await explorerApi.disconnectConnection(connectionId)
            // Drop green badge immediately after server confirms disconnect.
            clearConnectionLoadedState(connectionId)
            markConnectionNeedsReconnect(connectionId)
            return true
        } catch {
            return false
        }
    }

    async function connectConnection(
        connectionId: string,
        options?: {notify?: boolean},
    ): Promise<boolean> {
        const node = deps.findNode(connectionId)
        if (!node || node.type !== 'connection') return false

        // Community plugins have no JDBC pool — activate sidecar, connect, open workbench.
        if (node.dbType === 'plugin') {
            deps.loadingNodeIds.value.add(connectionId)
            try {
                const {connectAndOpenCommunityPluginWorkbench} = await import(
                    '@/features/community-plugin/lib/connectCommunityPluginWorkbench'
                )
                const result = await connectAndOpenCommunityPluginWorkbench(connectionId, {
                    title: node.label,
                })
                if (!result.ok) {
                    markConnectionAttempted(connectionId)
                    setConnectionHealth(connectionId, 'error')
                    unmarkConnectionPooled(connectionId)
                    if (options?.notify === true) {
                        useLayoutStore().showErrorToast(result.message || 'Plugin connect failed')
                    }
                    return false
                }
                markConnectionAttempted(connectionId)
                setConnectionHealth(connectionId, 'ok')
                markConnectionPooled(connectionId)
                clearConnectionNeedsReconnect(connectionId)
                markStartupPhase('first-connection')
                void import('@/features/workspace/services/welcome-recent-connections.service')
                    .then(({touchRecentConnection}) => touchRecentConnection(connectionId))
                    .catch(() => undefined)
                return true
            } catch (error) {
                markConnectionAttempted(connectionId)
                setConnectionHealth(connectionId, 'error')
                unmarkConnectionPooled(connectionId)
                void reportConnectionFailure(connectionId, error, {
                    notify: options?.notify,
                    retry: () => connectConnection(connectionId, {notify: options?.notify}),
                })
                return false
            } finally {
                deps.loadingNodeIds.value.delete(connectionId)
            }
        }

        deps.loadingNodeIds.value.add(connectionId)
        const startedAt = perfNow()
        try {
            const result = await explorerApi.connectConnection(connectionId)
            logPerf('connection.api', startedAt, {
                connectionId,
                ok: result.ok,
                serverProbeMs: result.latencyMs,
            })
            if (!result.ok) {
                markConnectionAttempted(connectionId)
                setConnectionHealth(connectionId, 'error')
                unmarkConnectionPooled(connectionId)
                if (options?.notify === true) {
                    useLayoutStore().showErrorToast(resolveConnectionErrorMessage(result))
                }
                return false
            }
            markConnectionAttempted(connectionId)
            // Show green badge as soon as connect succeeds — don't wait for tree expand.
            setConnectionHealth(connectionId, 'ok')
            markConnectionPooled(connectionId)
            clearConnectionNeedsReconnect(connectionId)
            markStartupPhase('first-connection')
            void import('@/features/workspace/services/welcome-recent-connections.service')
                .then(({touchRecentConnection}) => touchRecentConnection(connectionId))
                .catch(() => undefined)
            const expandStartedAt = perfNow()
            try {
                await deps.expandAndLoad(connectionId, {notify: options?.notify})
                logPerf('connection.expand', expandStartedAt, {connectionId})
            } catch (expandError) {
                // Pool is already warm — keep the green badge; tree can be expanded again later.
                void reportConnectionFailure(connectionId, expandError, {
                    notify: options?.notify,
                    retry: () => deps.expandAndLoad(connectionId, {notify: options?.notify}).then(() => true).catch(() => false),
                })
            }
            logPerf('connection.total', startedAt, {connectionId, ok: true})
            void reconnectSshTerminalsForConnection(connectionId)
            return true
        } catch (error) {
            markConnectionAttempted(connectionId)
            setConnectionHealth(connectionId, 'error')
            unmarkConnectionPooled(connectionId)
            void reportConnectionFailure(connectionId, error, {
                notify: options?.notify,
                retry: () => connectConnection(connectionId, {notify: options?.notify}),
            })
            return false
        } finally {
            deps.loadingNodeIds.value.delete(connectionId)
        }
    }

    async function reconnectConnection(
        connectionId: string,
        options?: {notify?: boolean},
    ): Promise<boolean> {
        const node = deps.findNode(connectionId)
        if (!node || node.type !== 'connection') return false

        clearConnectionLoadedState(connectionId)
        deps.loadingNodeIds.value.add(connectionId)
        const startedAt = perfNow()
        try {
            const result = await explorerApi.reconnectConnection(connectionId)
            logPerf('connection.reconnect.api', startedAt, {
                connectionId,
                ok: result.ok,
                serverProbeMs: result.latencyMs,
            })
            if (!result.ok) {
                markConnectionAttempted(connectionId)
                setConnectionHealth(connectionId, 'error')
                unmarkConnectionPooled(connectionId)
                markConnectionNeedsReconnect(connectionId)
                if (options?.notify === true) {
                    useLayoutStore().showErrorToast(resolveConnectionErrorMessage(result))
                }
                return false
            }
            markConnectionAttempted(connectionId)
            setConnectionHealth(connectionId, 'ok')
            markConnectionPooled(connectionId)
            clearConnectionNeedsReconnect(connectionId)
            const expandStartedAt = perfNow()
            try {
                await deps.expandAndLoad(connectionId, {notify: options?.notify})
                logPerf('connection.reconnect.expand', expandStartedAt, {connectionId})
            } catch (expandError) {
                void reportConnectionFailure(connectionId, expandError, {
                    notify: options?.notify,
                    retry: () => deps.expandAndLoad(connectionId, {notify: options?.notify}).then(() => true).catch(() => false),
                })
            }
            logPerf('connection.reconnect.total', startedAt, {connectionId, ok: true})
            void reconnectSshTerminalsForConnection(connectionId)
            return true
        } catch (error) {
            markConnectionAttempted(connectionId)
            setConnectionHealth(connectionId, 'error')
            unmarkConnectionPooled(connectionId)
            markConnectionNeedsReconnect(connectionId)
            void reportConnectionFailure(connectionId, error, {
                notify: options?.notify,
                retry: () => reconnectConnection(connectionId, {notify: options?.notify}),
            })
            return false
        } finally {
            deps.loadingNodeIds.value.delete(connectionId)
        }
    }

    return {
        connectionHealthById,
        connectionDisplayHealthById,
        pooledConnectionIds,
        isConnectionPooled,
        markConnectionPooled,
        unmarkConnectionPooled,
        needsReconnectConnectionIds,
        connectionNeedsReconnect,
        markConnectionNeedsReconnect,
        clearConnectionNeedsReconnect,
        attemptedConnectionIds,
        hasAttemptedConnections,
        markConnectionAttempted,
        pruneAttemptedConnections,
        setConnectionHealth,
        connectionHealthChecking,
        connectionHealthCheckedAt,
        reportConnectionFailure,
        probeAllConnectionHealth,
        handleServerIdleDisconnect,
        clearConnectionLoadedState,
        syncPooledConnectionState,
        disconnectConnection,
        connectConnection,
        reconnectConnection,
    }
}

export type ExplorerConnectionDomain = ReturnType<typeof createExplorerConnectionDomain>
