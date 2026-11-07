import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    isQuarantinedPluginFailure,
    normalizePluginFailureReason,
    pluginFailureReasonKey,
    pluginFailureTipKey,
} from '../../features/datasource/services/connector-plugin-failure.service.ts'

describe('connector-plugin-failure.service', () => {
    it('normalizes quarantined reason codes', () => {
        assert.equal(normalizePluginFailureReason('QUARANTINED:INTEGRITY_MISMATCH'), 'INTEGRITY_MISMATCH')
        assert.equal(isQuarantinedPluginFailure('QUARANTINED:INTEGRITY_MISMATCH'), true)
        assert.equal(isQuarantinedPluginFailure('NO_SPI_PROVIDERS'), false)
    })

    it('maps known reasons to i18n keys', () => {
        assert.equal(
            pluginFailureReasonKey('INTEGRITY_MISMATCH'),
            'plugin.connectorMarket.failureReasons.INTEGRITY_MISMATCH',
        )
        assert.equal(
            pluginFailureReasonKey('RUNTIME_COPY_LOCKED'),
            'plugin.connectorMarket.failureReasons.RUNTIME_COPY_LOCKED',
        )
        assert.equal(
            pluginFailureTipKey('QUARANTINED:MANIFEST_MISSING'),
            'plugin.connectorMarket.failureTips.MANIFEST_MISSING',
        )
        assert.equal(
            pluginFailureReasonKey('weird-custom'),
            'plugin.connectorMarket.failureReasons.GENERIC',
        )
    })
})
