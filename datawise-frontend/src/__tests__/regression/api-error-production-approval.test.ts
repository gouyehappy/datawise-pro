import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {ApiError, isProductionApprovalRequiredError} from '@/shared/api/http/api-error'

describe('isProductionApprovalRequiredError', () => {
    it('detects structured ApiError code', () => {
        assert.equal(
            isProductionApprovalRequiredError(
                new ApiError('SQL_PRODUCTION_APPROVAL_REQUIRED', {
                    errorCode: 'SQL_PRODUCTION_APPROVAL_REQUIRED',
                }),
            ),
            true,
        )
    })

    it('ignores unrelated errors', () => {
        assert.equal(isProductionApprovalRequiredError(new Error('boom')), false)
        assert.equal(
            isProductionApprovalRequiredError(new ApiError('fail', {errorCode: 'OTHER'})),
            false,
        )
    })
})
