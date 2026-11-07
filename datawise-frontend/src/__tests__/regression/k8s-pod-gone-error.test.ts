import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {ApiError} from '../../shared/api/http/api-error.ts'
import {isK8sPodGoneError} from '../../features/explorer/services/k8s-pod-error.ts'

describe('isK8sPodGoneError', () => {
    it('detects Kubernetes 404 pod-not-found payloads', () => {
        const message =
            'Kubernetes operation failed at dashboard:6443. Details: Kubernetes API request failed (404): '
            + '{"reason":"NotFound","message":"pods \\"sdi-etl-ffbc7b9c4-flzrf\\" not found"}'
        assert.equal(isK8sPodGoneError(new ApiError(message)), true)
    })

    it('ignores unrelated connection failures', () => {
        assert.equal(
            isK8sPodGoneError(new ApiError('Kubernetes operation failed: connection refused')),
            false,
        )
    })
})
