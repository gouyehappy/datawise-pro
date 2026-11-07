import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    collectConnectionHealthAlerts,
    ensureWatchedConnectionId,
    isConnectionWatchedInUi,
    resolveProbeIntervalMs,
    shouldAlertConnectionTransition,
    toggleWatchedConnectionId,
} from '@/features/explorer/services/connection-health-alert.service'
import {DEFAULT_CONNECTION_HEALTH_PREFERENCES} from '@/shared/config/app-config.defaults'

describe('connection-health-alert.service', () => {
    it('resolveProbeIntervalMs converts minutes to ms', () => {
        assert.equal(resolveProbeIntervalMs(5), 5 * 60 * 1000)
    })

    it('shouldAlertConnectionTransition respects prefs', () => {
        const prefs = {...DEFAULT_CONNECTION_HEALTH_PREFERENCES}
        assert.equal(shouldAlertConnectionTransition('ok', 'error', prefs), true)
        assert.equal(shouldAlertConnectionTransition(undefined, 'error', prefs), true)
        assert.equal(shouldAlertConnectionTransition('ok', 'ok', prefs), false)
        assert.equal(
            shouldAlertConnectionTransition('ok', 'error', {...prefs, alertsEnabled: false}),
            false,
        )
        assert.equal(
            shouldAlertConnectionTransition(undefined, 'error', {...prefs, alertOnUnknownToError: false}),
            false,
        )
    })

    it('collectConnectionHealthAlerts filters by watch list and transitions', () => {
        const rows = [
            {id: 'c1', name: 'A', dbType: 'mysql', status: 'error' as const},
            {id: 'c2', name: 'B', dbType: 'mysql', status: 'error' as const},
        ]
        const all = collectConnectionHealthAlerts({}, rows, DEFAULT_CONNECTION_HEALTH_PREFERENCES)
        assert.equal(all.length, 2)

        const watched = collectConnectionHealthAlerts({}, rows, {
            ...DEFAULT_CONNECTION_HEALTH_PREFERENCES,
            watchedConnectionIds: ['c1'],
        })
        assert.equal(watched.length, 1)
        assert.equal(watched[0]?.id, 'c1')

        const okOnly = collectConnectionHealthAlerts(
            {c1: 'ok', c2: 'ok'},
            rows,
            {...DEFAULT_CONNECTION_HEALTH_PREFERENCES, alertOnUnknownToError: false},
        )
        assert.equal(okOnly.length, 2)
        assert.equal(
            collectConnectionHealthAlerts({c1: 'ok'}, rows, {
                ...DEFAULT_CONNECTION_HEALTH_PREFERENCES,
                alertOnUnknownToError: false,
            }).length,
            1,
        )
    })

    it('toggleWatchedConnectionId maintains all-watched sentinel', () => {
        const allIds = ['c1', 'c2']
        assert.deepEqual(
            toggleWatchedConnectionId('c1', allIds, DEFAULT_CONNECTION_HEALTH_PREFERENCES),
            ['c2'],
        )
        assert.deepEqual(
            toggleWatchedConnectionId('c2', allIds, {
                ...DEFAULT_CONNECTION_HEALTH_PREFERENCES,
                watchedConnectionIds: ['c2'],
            }),
            [],
        )
    })

    it('isConnectionWatchedInUi treats empty list as all watched', () => {
        assert.equal(isConnectionWatchedInUi('c1', ['c1', 'c2'], DEFAULT_CONNECTION_HEALTH_PREFERENCES), true)
        assert.equal(
            isConnectionWatchedInUi('c1', ['c1', 'c2'], {
                ...DEFAULT_CONNECTION_HEALTH_PREFERENCES,
                watchedConnectionIds: ['c2'],
            }),
            false,
        )
    })

    it('ensureWatchedConnectionId appends when watch list is a subset', () => {
        assert.deepEqual(
            ensureWatchedConnectionId('c3', {
                ...DEFAULT_CONNECTION_HEALTH_PREFERENCES,
                watchedConnectionIds: ['c1'],
            }),
            ['c1', 'c3'],
        )
        assert.equal(
            ensureWatchedConnectionId('c1', {
                ...DEFAULT_CONNECTION_HEALTH_PREFERENCES,
                watchedConnectionIds: ['c1'],
            }),
            null,
        )
        assert.equal(ensureWatchedConnectionId('c1', DEFAULT_CONNECTION_HEALTH_PREFERENCES), null)
    })
})
