import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    FEDERATED_DEFAULT_MAX_ROWS,
    FEDERATED_HARD_MAX_ROWS,
    canRaiseFederatedMaxRows,
    nextFederatedMaxRows,
    resolveFederatedMaxRows,
} from '@/features/platform/services/federated-max-rows.service'

describe('federated-max-rows.service', () => {
    it('resolveFederatedMaxRows defaults and caps', () => {
        assert.equal(resolveFederatedMaxRows(), FEDERATED_DEFAULT_MAX_ROWS)
        assert.equal(resolveFederatedMaxRows(null), FEDERATED_DEFAULT_MAX_ROWS)
        assert.equal(resolveFederatedMaxRows(0), FEDERATED_DEFAULT_MAX_ROWS)
        assert.equal(resolveFederatedMaxRows(500), 500)
        assert.equal(resolveFederatedMaxRows(999_999), FEDERATED_HARD_MAX_ROWS)
    })

    it('nextFederatedMaxRows steps toward hard cap', () => {
        assert.equal(nextFederatedMaxRows(FEDERATED_DEFAULT_MAX_ROWS), 5_000)
        assert.equal(nextFederatedMaxRows(5_000), FEDERATED_HARD_MAX_ROWS)
        assert.equal(nextFederatedMaxRows(FEDERATED_HARD_MAX_ROWS), null)
        assert.equal(nextFederatedMaxRows(2_000), 5_000)
    })

    it('canRaiseFederatedMaxRows mirrors next step availability', () => {
        assert.equal(canRaiseFederatedMaxRows(FEDERATED_DEFAULT_MAX_ROWS), true)
        assert.equal(canRaiseFederatedMaxRows(FEDERATED_HARD_MAX_ROWS), false)
    })
})
