import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    DEV_PRODUCTIVITY_PLUGIN_IDS,
    hasDevProductivityAccess,
    isDevProductivityPlugin,
} from '@/features/pack/services/dev-productivity-entitlement'

describe('dev-productivity-entitlement', () => {
    it('recognizes the three Pro-gifted plugins', () => {
        for (const id of DEV_PRODUCTIVITY_PLUGIN_IDS) {
            assert.equal(isDevProductivityPlugin(id), true)
        }
        assert.equal(isDevProductivityPlugin('p-sql-format'), false)
    })

    it('allows access in open mode', () => {
        assert.equal(hasDevProductivityAccess({mode: 'open', suiteId: null}), true)
    })

    it('requires Pro+ suite when enforced', () => {
        assert.equal(hasDevProductivityAccess({mode: 'enforced', suiteId: null}), false)
        assert.equal(hasDevProductivityAccess({mode: 'enforced', suiteId: 'suite.pro'}), true)
        assert.equal(
            hasDevProductivityAccess({mode: 'enforced', suiteId: 'suite.enterprise'}),
            true,
        )
        assert.equal(
            hasDevProductivityAccess({mode: 'enforced', suiteId: 'suite.platform'}),
            true,
        )
    })
})
