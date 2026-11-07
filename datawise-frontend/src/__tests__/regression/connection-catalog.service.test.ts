import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    isPersistedConnectionId,
    resolveConnectionCatalogErrorMessage,
} from '@/features/connection/services/connection-catalog.service'

describe('connection-catalog.service', () => {
    it('treats new-* ids as not persisted', () => {
        assert.equal(isPersistedConnectionId('new-123'), false)
        assert.equal(isPersistedConnectionId('conn-abc'), true)
    })

    it('maps connection access denied on save', () => {
        const t = (key: string) => key
        assert.equal(
            resolveConnectionCatalogErrorMessage(new Error('CONNECTION_ACCESS_DENIED'), t, 'save'),
            'connection.saveAccessDenied',
        )
    })

    it('maps connection access denied on delete', () => {
        const t = (key: string) => key
        assert.equal(
            resolveConnectionCatalogErrorMessage(new Error('CONNECTION_ACCESS_DENIED'), t, 'delete'),
            'connection.deleteAccessDenied',
        )
    })

    it('maps permission denied via stable error code', () => {
        const t = (key: string) => `tr:${key}`
        assert.equal(
            resolveConnectionCatalogErrorMessage(new Error('PERMISSION_DENIED'), t, 'save'),
            'tr:auth.permissionDenied',
        )
    })
})
