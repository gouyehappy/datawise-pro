import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    resolveLogLevelVariant,
    resolveStatusVariant,
    statusVariantClass,
} from '@/core/utils/status-variant'

describe('status-variant', () => {
    it('maps export statuses', () => {
        assert.equal(resolveStatusVariant('running', 'export'), 'running')
        assert.equal(resolveStatusVariant('failed', 'export'), 'error')
        assert.equal(resolveStatusVariant('done', 'export'), 'success')
    })

    it('maps migration statuses', () => {
        assert.equal(resolveStatusVariant('partial', 'migration'), 'warn')
        assert.equal(resolveStatusVariant('success', 'migration'), 'success')
    })

    it('maps log statuses', () => {
        assert.equal(resolveStatusVariant('error', 'log'), 'error')
        assert.equal(resolveStatusVariant('ok', 'log'), 'success')
    })

    it('maps preflight and validation domains', () => {
        assert.equal(resolveStatusVariant('ready', 'preflight'), 'success')
        assert.equal(resolveStatusVariant('blocked', 'preflight'), 'error')
        assert.equal(resolveStatusVariant('match', 'validation'), 'success')
        assert.equal(resolveStatusVariant('mismatch', 'validation'), 'error')
    })

    it('maps schema and connection domains', () => {
        assert.equal(resolveStatusVariant('added', 'schema'), 'success')
        assert.equal(resolveStatusVariant('removed', 'schema'), 'error')
        assert.equal(resolveStatusVariant('changed', 'schema'), 'primary')
        assert.equal(resolveStatusVariant('unchanged', 'schema'), 'neutral')
        assert.equal(resolveStatusVariant('ok', 'connection'), 'success')
        assert.equal(resolveStatusVariant('unknown', 'connection'), 'neutral')
    })

    it('falls back to neutral for unknown status', () => {
        assert.equal(resolveStatusVariant('unknown'), 'neutral')
        assert.equal(resolveStatusVariant(null), 'neutral')
    })

    it('resolves log level variants', () => {
        assert.equal(resolveLogLevelVariant('warn'), 'warn')
        assert.equal(resolveLogLevelVariant('info'), 'info')
    })

    it('produces stable css class names', () => {
        assert.equal(statusVariantClass('success'), 'dw-status--success')
    })
})
