import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildSlowQueryAlertParams,
    formatAlertDuration,
    shouldAlertSlowQuery,
    shouldPersistAlertInDrawer,
    truncateSqlPreview,
} from '@/features/layout/services/app-alert.service'
import {DEFAULT_CONNECTION_HEALTH_PREFERENCES} from '@/shared/config/app-config.defaults'

describe('app-alert.service', () => {
    it('respects slow query and drawer toggles', () => {
        assert.equal(
            shouldAlertSlowQuery(4000, 3000, DEFAULT_CONNECTION_HEALTH_PREFERENCES),
            true,
        )
        assert.equal(
            shouldAlertSlowQuery(4000, 3000, {
                ...DEFAULT_CONNECTION_HEALTH_PREFERENCES,
                slowQueryAlertsEnabled: false,
            }),
            false,
        )
        assert.equal(shouldPersistAlertInDrawer(DEFAULT_CONNECTION_HEALTH_PREFERENCES), true)
        assert.equal(
            shouldPersistAlertInDrawer({
                ...DEFAULT_CONNECTION_HEALTH_PREFERENCES,
                drawerAlertsEnabled: false,
            }),
            false,
        )
    })

    it('formats duration and truncates sql preview', () => {
        assert.equal(formatAlertDuration(850), '850ms')
        assert.equal(formatAlertDuration(3200), '3.2s')
        assert.equal(truncateSqlPreview('select * from users where id = 1'), 'select * from users where id = 1')
        assert.match(truncateSqlPreview('x'.repeat(200)), /…$/)
    })

    it('builds slow query notification params', () => {
        const params = buildSlowQueryAlertParams(
            {sql: 'SELECT 1', durationMs: 4200, duration: '4200ms'},
            3000,
            'Shop DB',
        )
        assert.equal(params.duration, '4200ms')
        assert.equal(params.threshold, 3000)
        assert.equal(params.connection, '「Shop DB」· ')
        assert.equal(params.sql, 'SELECT 1')
    })
})
