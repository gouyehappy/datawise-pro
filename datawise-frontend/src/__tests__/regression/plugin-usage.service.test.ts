import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {comparePluginUsageIds, pluginUsageTotal} from '@/features/plugin/services/plugin-usage.service'

describe('plugin-usage.service', () => {
    it('pluginUsageTotal sums enable and disable counts', () => {
        assert.equal(pluginUsageTotal(null), 0)
        assert.equal(pluginUsageTotal({enable: 2, disable: 1}), 3)
    })

    it('comparePluginUsageIds returns zero when both plugins have no stats', () => {
        assert.equal(comparePluginUsageIds('p-grid-export', 'p-sql-format'), 0)
    })
})
