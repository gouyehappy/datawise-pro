import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    formatBytes,
    formatDuration,
    formatPercent,
} from '@/features/settings/services/system-metrics-format.service'

describe('system-metrics-format.service', () => {
    it('formats bytes and duration', () => {
        assert.equal(formatBytes(512), '512 B')
        assert.equal(formatBytes(2048), '2.0 KB')
        assert.equal(formatDuration(65_000), '1m 5s')
        assert.equal(formatPercent(42.18), '42.2%')
    })
})
