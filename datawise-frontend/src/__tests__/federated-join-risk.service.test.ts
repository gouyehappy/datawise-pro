import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {presentFederatedJoinRisk} from '@/features/platform/services/federated-join-risk.service'
import type {FederatedJoinRiskHints} from '@/features/platform/types/platform.types'

function hints(partial: Partial<FederatedJoinRiskHints>): FederatedJoinRiskHints {
    return {
        parseable: true,
        parseError: null,
        joinStepCount: 2,
        pushedFilterCount: 1,
        residualFilterCount: 0,
        equalityJoin: true,
        truncationRiskElevated: false,
        defaultMaxRows: 1000,
        hardMaxRows: 10_000,
        ...partial,
    }
}

describe('presentFederatedJoinRisk', () => {
    it('returns null for missing hints', () => {
        assert.equal(presentFederatedJoinRisk(null), null)
    })

    it('maps unparseable SQL to error', () => {
        const presented = presentFederatedJoinRisk(hints({
            parseable: false,
            parseError: 'JOIN requires ON',
            truncationRiskElevated: true,
        }))
        assert.equal(presented?.tone, 'error')
        assert.equal(presented?.summaryKey, 'unparseable')
        assert.equal(presented?.params.parseError, 'JOIN requires ON')
    })

    it('warns when residual filters remain', () => {
        const presented = presentFederatedJoinRisk(hints({
            residualFilterCount: 1,
            truncationRiskElevated: true,
        }))
        assert.equal(presented?.tone, 'warning')
        assert.equal(presented?.summaryKey, 'elevated')
        assert.equal(presented?.params.residual, 1)
    })

    it('uses info when equality join and no residual', () => {
        const presented = presentFederatedJoinRisk(hints({
            pushedFilterCount: 2,
            residualFilterCount: 0,
            equalityJoin: true,
            truncationRiskElevated: false,
        }))
        assert.equal(presented?.tone, 'info')
        assert.equal(presented?.summaryKey, 'ok')
        assert.equal(presented?.params.pushed, 2)
    })
})
