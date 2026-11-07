import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {selectPreflightTableName} from '@/features/explorer/services/table-migration.pure'

describe('bug-038 preflight table selection', () => {
    it('selects table without toggling closed on re-click', () => {
        assert.equal(selectPreflightTableName(null, 'cdp_segment'), 'cdp_segment')
        assert.equal(selectPreflightTableName('cdp_segment', 'cdp_segment'), 'cdp_segment')
        assert.equal(selectPreflightTableName('cdp_segment', 'other_table'), 'other_table')
    })
})
