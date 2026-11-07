import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildConnectionDisplayHealthMap,
    isStatelessConnector,
    mergePooledConnectionSync,
    resolveConnectionDisplayHealth,
    resolveConnectionLinkState,
    usesConnectionReconnectOverlay,
    usesJdbcConnectionPool,
    usesPeriodicConnectionHealthProbe,
} from '../../features/explorer/services/explorer-connection-state.service.ts'

describe('explorer connection state', () => {
    it('display health only for pooled connections', () => {
        const pooled = new Set(['a', 'b'])
        const reachability = {a: 'ok' as const, b: 'error' as const, c: 'ok' as const}
        assert.equal(resolveConnectionDisplayHealth('a', pooled, reachability), 'ok')
        assert.equal(resolveConnectionDisplayHealth('b', pooled, reachability), 'error')
        assert.equal(resolveConnectionDisplayHealth('c', pooled, reachability), undefined)
        assert.deepEqual(buildConnectionDisplayHealthMap(pooled, reachability), {
            a: 'ok',
            b: 'error',
        })
    })

    it('link state uses pooled set for connected vs disconnected', () => {
        const pooled = new Set(['warm'])
        const loading = new Set<string>()
        assert.equal(
            resolveConnectionLinkState('warm', pooled, {warm: 'ok'}, loading),
            'connected',
        )
        assert.equal(
            resolveConnectionLinkState('cold', pooled, {cold: 'ok'}, loading),
            'disconnected',
        )
        assert.equal(
            resolveConnectionLinkState('cold', pooled, {cold: 'error'}, loading),
            'error',
        )
    })

    it('classifies non-jdbc datasources that never appear in server pool lists', () => {
        assert.equal(usesJdbcConnectionPool('mysql'), true)
        assert.equal(usesJdbcConnectionPool('redis'), false)
        assert.equal(usesJdbcConnectionPool('ssh'), false)
        assert.equal(usesJdbcConnectionPool('kafka'), false)
        assert.equal(usesJdbcConnectionPool('jenkins'), false)
        assert.equal(usesJdbcConnectionPool('nacos'), false)
        assert.equal(usesJdbcConnectionPool('polaris'), false)
        assert.equal(usesJdbcConnectionPool('kubernetes'), false)
        assert.equal(usesJdbcConnectionPool('yarn'), false)
        assert.equal(usesJdbcConnectionPool('plugin'), false)
    })

    it('stateless connectors skip reconnect overlay; jdbc keeps it', () => {
        assert.equal(isStatelessConnector('jenkins'), true)
        assert.equal(isStatelessConnector('nacos'), true)
        assert.equal(isStatelessConnector('polaris'), true)
        assert.equal(isStatelessConnector('kubernetes'), true)
        assert.equal(isStatelessConnector('yarn'), true)
        assert.equal(isStatelessConnector('redis'), true)
        assert.equal(isStatelessConnector('ssh'), true)
        assert.equal(isStatelessConnector('plugin'), true)
        assert.equal(isStatelessConnector('mysql'), false)
        assert.equal(usesConnectionReconnectOverlay('jenkins'), false)
        assert.equal(usesConnectionReconnectOverlay('nacos'), false)
        assert.equal(usesConnectionReconnectOverlay('polaris'), false)
        assert.equal(usesConnectionReconnectOverlay('kubernetes'), false)
        assert.equal(usesConnectionReconnectOverlay('ssh'), false)
        assert.equal(usesConnectionReconnectOverlay('plugin'), false)
        assert.equal(usesConnectionReconnectOverlay('mysql'), true)
    })

    it('periodic health probe only applies to jdbc pools', () => {
        assert.equal(usesPeriodicConnectionHealthProbe('mysql'), true)
        assert.equal(usesPeriodicConnectionHealthProbe('ssh'), false)
        assert.equal(usesPeriodicConnectionHealthProbe('plugin'), false)
        assert.equal(usesPeriodicConnectionHealthProbe('redis'), false)
        assert.equal(usesPeriodicConnectionHealthProbe('jenkins'), false)
        assert.equal(usesPeriodicConnectionHealthProbe('nacos'), false)
        assert.equal(usesPeriodicConnectionHealthProbe('polaris'), false)
        assert.equal(usesPeriodicConnectionHealthProbe('kubernetes'), false)
    })

    it('pool sync keeps ssh green while terminal tab is open', () => {
        const {nextPooledIds, evictedIds} = mergePooledConnectionSync({
            serverPooledIds: [],
            previousPooledIds: new Set(['ssh-live']),
            resolveDbType: () => 'ssh',
            isUiConnected: () => false,
            isConnectionInUse: () => true,
        })
        assert.deepEqual([...nextPooledIds], ['ssh-live'])
        assert.deepEqual(evictedIds, [])
    })

    it('pool sync keeps stateless connectors while in use without health ok', () => {
        const {nextPooledIds, evictedIds} = mergePooledConnectionSync({
            serverPooledIds: [],
            previousPooledIds: new Set(['jenkins-live']),
            resolveDbType: () => 'jenkins',
            isUiConnected: () => false,
            isConnectionInUse: () => true,
        })
        assert.deepEqual([...nextPooledIds], ['jenkins-live'])
        assert.deepEqual(evictedIds, [])
    })

    it('pool sync keeps community plugin green while workbench tab is open', () => {
        const {nextPooledIds, evictedIds} = mergePooledConnectionSync({
            serverPooledIds: [],
            previousPooledIds: new Set(['plugin-ssh']),
            resolveDbType: () => 'plugin',
            isUiConnected: () => false,
            isConnectionInUse: () => true,
        })
        assert.deepEqual([...nextPooledIds], ['plugin-ssh'])
        assert.deepEqual(evictedIds, [])
    })

    it('pool sync keeps ui-connected non-jdbc greens and evicts dropped jdbc pools', () => {
        const dbTypes: Record<string, string> = {
            'jdbc-warm': 'mysql',
            'jdbc-gone': 'mysql',
            'redis-live': 'redis',
            'jenkins-live': 'jenkins',
        }
        const health: Record<string, 'ok' | 'error'> = {
            'jdbc-warm': 'ok',
            'jdbc-gone': 'ok',
            'redis-live': 'ok',
            'jenkins-live': 'ok',
        }
        const {nextPooledIds, evictedIds} = mergePooledConnectionSync({
            serverPooledIds: ['jdbc-warm'],
            previousPooledIds: new Set(['jdbc-warm', 'jdbc-gone', 'redis-live', 'jenkins-live']),
            resolveDbType: (id) => dbTypes[id],
            isUiConnected: (id) => health[id] === 'ok',
        })
        assert.deepEqual([...nextPooledIds].sort(), ['jdbc-warm', 'jenkins-live', 'redis-live'])
        assert.deepEqual(evictedIds, ['jdbc-gone'])
    })
})
