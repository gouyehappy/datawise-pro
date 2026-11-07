import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {ApiError, HTTP_NOT_READY} from '../../shared/api/http/request.ts'
import {
    isExpectedServiceUnavailablePhase,
    shouldSuppressApiErrorToast,
    shouldSuppressServiceUnavailableToast,
} from '../../shared/api/http/api-error-toast-policy.ts'

const desktopStarting = {
    desktopApp: true,
    desktopStartupComplete: false,
    backendOnline: false,
}

const desktopReady = {
    desktopApp: true,
    desktopStartupComplete: true,
    backendOnline: true,
}

const serviceOffline = {
    desktopApp: true,
    desktopStartupComplete: true,
    backendOnline: false,
}

describe('api error toast policy', () => {
    it('treats HTTP_NOT_READY as service unavailable', () => {
        assert.equal(
            shouldSuppressServiceUnavailableToast(new ApiError(HTTP_NOT_READY), desktopStarting),
            true,
        )
    })

    it('suppresses service unavailable errors during desktop startup', () => {
        assert.equal(
            shouldSuppressServiceUnavailableToast(new ApiError(HTTP_NOT_READY), desktopStarting),
            true,
        )
        assert.equal(
            shouldSuppressServiceUnavailableToast(new ApiError('Server error'), desktopStarting),
            false,
        )
    })

    it('does not suppress service unavailable errors after service is online', () => {
        assert.equal(
            shouldSuppressServiceUnavailableToast(new ApiError(HTTP_NOT_READY), desktopReady),
            false,
        )
    })

    it('suppresses service unavailable errors while status bar shows offline/connecting', () => {
        assert.equal(isExpectedServiceUnavailablePhase(serviceOffline), true)
        assert.equal(
            shouldSuppressServiceUnavailableToast(new ApiError(HTTP_NOT_READY), serviceOffline),
            true,
        )
    })
})
