import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {ApiError} from '../../shared/api/http/request.ts'
import {resolveApiErrorMessage} from '../../shared/api/http/api-error-message.ts'
import {
    notifyApiError,
    registerApiErrorNotifier,
} from '../../shared/api/http/api-error-notifier.ts'

describe('resolveApiErrorMessage', () => {
    it('returns backend msg from ApiError', () => {
        const message = resolveApiErrorMessage(
            new ApiError('Unsupported db type: redis'),
        )
        assert.equal(message, 'Unsupported db type: redis')
    })

    it('falls back when message is blank', () => {
        const message = resolveApiErrorMessage(new ApiError('   '))
        assert.match(message, /HTTP API request failed/)
    })
})

describe('notifyApiError', () => {
    it('notifies by default', () => {
        const seen: string[] = []
        registerApiErrorNotifier((message) => {
            seen.push(message)
        })
        notifyApiError(new ApiError('boom'))
        assert.deepEqual(seen, ['boom'])
        registerApiErrorNotifier(null)
    })

    it('skips notification when silent', () => {
        const seen: string[] = []
        registerApiErrorNotifier((message) => {
            seen.push(message)
        })
        notifyApiError(new ApiError('hidden'), {silent: true})
        assert.deepEqual(seen, [])
        registerApiErrorNotifier(null)
    })

    it('skips UNAUTHORIZED when notifier chooses to suppress', () => {
        const seen: string[] = []
        registerApiErrorNotifier((message, error) => {
            if (error.message.trim() === 'UNAUTHORIZED') return
            seen.push(message)
        })
        notifyApiError(new ApiError('UNAUTHORIZED'))
        notifyApiError(new ApiError('Server error'))
        assert.deepEqual(seen, ['Server error'])
        registerApiErrorNotifier(null)
    })
})
