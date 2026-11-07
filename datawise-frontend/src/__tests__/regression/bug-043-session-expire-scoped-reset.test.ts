import {describe, it, beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {
    isApiSessionBlocked,
    markApiSessionBlockedForTest,
    maybeRejectBlockedRequest,
    resetUnauthorizedRecoveryState,
    setUnauthorizedRecoveryInProgress,
    unblockApiSession,
} from '../../shared/api/http/session-guard.ts'

/**
 * bug-043: 会话超时弹出登录遮罩后，后台仍保留上一账号的数据源树等用户态。
 *
 * 根因：401 恢复期间 sessionBlocked=true，loginAsGuest → resetUserScopedState
 * 里的 explorer.refreshTree 等 API 被拦截失败，旧状态留在遮罩后面。
 * 修复：恢复中先落到游客会话，unblock 后再 reset；recoveryInProgress 期间不再二次拦截。
 */
describe('bug-043 session expire clears scoped state after unblock', () => {
    beforeEach(() => {
        resetUnauthorizedRecoveryState()
    })

    it('rejects scoped API calls while session is blocked', () => {
        markApiSessionBlockedForTest()
        assert.throws(() => maybeRejectBlockedRequest())
    })

    it('allows scoped API calls after unblock during recovery window', () => {
        setUnauthorizedRecoveryInProgress(true)
        markApiSessionBlockedForTest()
        unblockApiSession()
        assert.equal(isApiSessionBlocked(), false)
        assert.doesNotThrow(() => maybeRejectBlockedRequest())
    })
})
