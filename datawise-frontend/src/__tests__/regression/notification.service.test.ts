import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {resolveSlowQueryDetails} from '@/features/layout/services/notification.service'

describe('notification.service', () => {
    it('extracts slow query details from notification params', () => {
        const details = resolveSlowQueryDetails({
            id: 'n1',
            category: 'workspace',
            titleKey: 'alertSlowQuery',
            bodyKey: 'alertSlowQuery',
            createdAt: Date.now(),
            read: false,
            params: {
                connection: '「sr 192.0.2.67」· ',
                duration: '5218ms',
                threshold: 3000,
                sql: 'SELECT * FROM a003.aaa_test',
            },
        })
        assert.equal(details?.connectionLabel, 'sr 192.0.2.67')
        assert.equal(details?.duration, '5218ms')
        assert.equal(details?.threshold, 3000)
        assert.equal(details?.sql, 'SELECT * FROM a003.aaa_test')
    })

    it('returns null for non slow-query notifications', () => {
        assert.equal(
            resolveSlowQueryDetails({
                id: 'n2',
                category: 'info',
                titleKey: 'welcome',
                bodyKey: 'welcome',
                createdAt: Date.now(),
                read: false,
            }),
            null,
        )
    })
})
