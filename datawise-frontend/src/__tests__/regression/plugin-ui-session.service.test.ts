import assert from 'node:assert/strict'
import {beforeEach, describe, it} from 'node:test'
import {
    clearReferenceConflictBannerDismiss,
    readReferenceConflictBannerDismiss,
    shouldShowReferenceConflictBanner,
    writeReferenceConflictBannerDismiss,
} from '@/features/plugin/services/plugin-ui-session.service'
import {setAppConfigStorageScope} from '@/shared/config/app-config-storage-scope'
import {persistSession} from '@/shared/auth/session'

function setupUserScope(userId: number) {
    persistSession(`session-${userId}`, `user-${userId}`, false, null, userId)
    setAppConfigStorageScope({userId, userName: `user-${userId}`, isGuest: false})
}

describe('plugin-ui-session.service', () => {
    beforeEach(() => {
        sessionStorage.clear()
        setupUserScope(3)
        clearReferenceConflictBannerDismiss()
    })

    it('shouldShowReferenceConflictBanner hides when dismissed snapshot matches', () => {
        const dismissed = {presetId: 'minimal' as const, conflictCount: 2}
        assert.equal(shouldShowReferenceConflictBanner('minimal', 2, dismissed), false)
    })

    it('shouldShowReferenceConflictBanner re-shows when conflict count changes', () => {
        const dismissed = {presetId: 'minimal' as const, conflictCount: 2}
        assert.equal(shouldShowReferenceConflictBanner('minimal', 3, dismissed), true)
    })

    it('shouldShowReferenceConflictBanner re-shows when reference preset changes', () => {
        const dismissed = {presetId: 'minimal' as const, conflictCount: 2}
        assert.equal(shouldShowReferenceConflictBanner('developer', 2, dismissed), true)
    })

    it('write and read dismiss snapshot via user-scoped sessionStorage', () => {
        writeReferenceConflictBannerDismiss({presetId: 'dba', conflictCount: 1})
        assert.deepEqual(readReferenceConflictBannerDismiss(), {presetId: 'dba', conflictCount: 1})
        clearReferenceConflictBannerDismiss()
        assert.equal(readReferenceConflictBannerDismiss(), null)
    })

    it('isolates dismiss snapshot per user', () => {
        writeReferenceConflictBannerDismiss({presetId: 'dba', conflictCount: 1})
        setupUserScope(4)
        assert.equal(readReferenceConflictBannerDismiss(), null)
        writeReferenceConflictBannerDismiss({presetId: 'minimal', conflictCount: 2})
        setupUserScope(3)
        assert.deepEqual(readReferenceConflictBannerDismiss(), {presetId: 'dba', conflictCount: 1})
    })
})
