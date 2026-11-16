import {beforeEach, describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {ApiError} from '../../shared/api/http/api-error.ts'
import {
    classifyAuthFailure,
    readAuthFailureCode,
    resolveAuthErrorToastPlan,
} from '../../shared/api/http/auth-error-scenario.ts'
import {isGuestOrAnonymousSession} from '../../shared/auth/user-access-policy.ts'
import {
    GUEST_HINT_MIN_INTERVAL_MS,
    GUEST_HINT_SAME_INTERVAL_MS,
    shouldThrottleGuestHint,
} from '../../features/layout/services/guest-feature-hint.service.ts'
import {PLUGIN_REGISTRY} from '../../features/plugin/services/plugin-registry.service.ts'
import {LOCAL_PLUGIN_CATALOG} from '../../features/plugin/services/plugin-catalog.seed.ts'

function apiError(code: string): ApiError {
    return new ApiError(code, {errorCode: code})
}

const guestInteractive = {isGuest: true, recovering: false, background: false}
const guestBackground = {isGuest: true, recovering: false, background: true}
const guestRecovering = {isGuest: true, recovering: true, background: false}
const loggedInInteractive = {isGuest: false, recovering: false, background: false}

describe('auth error scenario classification', () => {
    it('prefers structured errorCode over msg', () => {
        const error = new ApiError('服务内部错误', {errorCode: 'PERMISSION_DENIED'})
        assert.equal(readAuthFailureCode(error), 'PERMISSION_DENIED')
        assert.equal(classifyAuthFailure(error), 'permission')
    })

    it('recognizes auth / permission / guest / admin codes', () => {
        assert.equal(classifyAuthFailure(apiError('UNAUTHORIZED')), 'unauthorized')
        assert.equal(classifyAuthFailure(new ApiError('HTTP 401')), 'unauthorized')
        assert.equal(classifyAuthFailure(apiError('PERMISSION_DENIED')), 'permission')
        assert.equal(classifyAuthFailure(apiError('FORBIDDEN')), 'permission')
        assert.equal(classifyAuthFailure(new ApiError('HTTP 403')), 'permission')
        assert.equal(classifyAuthFailure(new ApiError('当前账号没有此操作权限')), 'permission')
        assert.equal(classifyAuthFailure(apiError('GUEST_NOT_ALLOWED')), 'guest-not-allowed')
        assert.equal(classifyAuthFailure(apiError('ADMIN_REQUIRED')), 'admin')
        assert.equal(classifyAuthFailure(new ApiError('SQL 执行失败')), 'other')
    })

    it('keeps 401 silent so the session recovery flow owns the message', () => {
        assert.deepEqual(
            resolveAuthErrorToastPlan(apiError('UNAUTHORIZED'), guestInteractive),
            {kind: 'silent'},
        )
    })

    it('gives guests a friendly hint instead of a permission-denied error', () => {
        assert.deepEqual(
            resolveAuthErrorToastPlan(apiError('PERMISSION_DENIED'), guestInteractive),
            {kind: 'guest-hint', messageKey: 'auth.guestFeatureLocked'},
        )
        assert.deepEqual(
            resolveAuthErrorToastPlan(apiError('GUEST_NOT_ALLOWED'), guestInteractive),
            {kind: 'guest-hint', messageKey: 'auth.guestNotAllowed'},
        )
        assert.deepEqual(
            resolveAuthErrorToastPlan(apiError('ADMIN_REQUIRED'), guestInteractive),
            {kind: 'guest-hint', messageKey: 'auth.guestFeatureLocked'},
        )
    })

    it('never toasts background loads or in-flight session recovery', () => {
        for (const scene of [guestBackground, guestRecovering]) {
            assert.deepEqual(
                resolveAuthErrorToastPlan(apiError('PERMISSION_DENIED'), scene),
                {kind: 'silent'},
            )
        }
    })

    it('keeps the original permission copy for signed-in users', () => {
        assert.deepEqual(
            resolveAuthErrorToastPlan(apiError('PERMISSION_DENIED'), loggedInInteractive),
            {kind: 'normal'},
        )
        assert.deepEqual(
            resolveAuthErrorToastPlan(apiError('ADMIN_REQUIRED'), loggedInInteractive),
            {kind: 'normal'},
        )
    })

    it('leaves business failures to the existing notifier', () => {
        assert.deepEqual(
            resolveAuthErrorToastPlan(new ApiError('SQL 执行失败'), guestInteractive),
            {kind: 'normal'},
        )
    })
})

describe('guest / anonymous session detection', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('treats a missing session as guest-like', () => {
        assert.equal(isGuestOrAnonymousSession(), true)
    })

    it('distinguishes a registered session from a guest session', () => {
        localStorage.setItem('dw-cli-session-id', 'session-abc')
        localStorage.setItem('dw-cli-is-guest', '0')
        assert.equal(isGuestOrAnonymousSession(), false)
        localStorage.setItem('dw-cli-is-guest', '1')
        assert.equal(isGuestOrAnonymousSession(), true)
    })
})

describe('guest local plugin catalog', () => {
    it('stays in sync with the frontend plugin registry', () => {
        const registryIds = Object.keys(PLUGIN_REGISTRY).sort()
        const localIds = LOCAL_PLUGIN_CATALOG.map((item) => item.id).sort()
        assert.deepEqual(localIds, registryIds)
    })

    it('keeps datasource plugins enabled with their real category', () => {
        const mysql = LOCAL_PLUGIN_CATALOG.find((item) => item.id === 'p-mysql-explorer')
        assert.equal(mysql?.enabled, true)
        assert.equal(mysql?.category, 'datasource')
    })
})

describe('guest hint throttle', () => {
    it('suppresses bursts and repeated identical hints', () => {
        const key = 'auth.guestFeatureLocked'
        assert.equal(shouldThrottleGuestHint(key, 1_000_000, 0, ''), false)
        assert.equal(
            shouldThrottleGuestHint(key, 1_000_000 + GUEST_HINT_MIN_INTERVAL_MS - 1, 1_000_000, key),
            true,
        )
        assert.equal(
            shouldThrottleGuestHint(key, 1_000_000 + GUEST_HINT_SAME_INTERVAL_MS - 1, 1_000_000, key),
            true,
        )
        assert.equal(
            shouldThrottleGuestHint(key, 1_000_000 + GUEST_HINT_SAME_INTERVAL_MS, 1_000_000, key),
            false,
        )
        assert.equal(
            shouldThrottleGuestHint('auth.guestNotAllowed', 1_000_000 + GUEST_HINT_MIN_INTERVAL_MS, 1_000_000, key),
            false,
        )
    })
})
