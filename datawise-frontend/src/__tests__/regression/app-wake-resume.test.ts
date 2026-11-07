import {describe, it, beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {
    WAKE_AWAY_MS,
    clearWakeReloadCount,
    resumeAfterLongAwayPure,
    type WakeResumeStorage,
} from '../../app/services/app-wake-resume.pure.ts'

function memoryStorage(): WakeResumeStorage {
    const map = new Map<string, string>()
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value)
        },
        removeItem: (key) => {
            map.delete(key)
        },
    }
}

describe('app-wake-resume', () => {
    let storage: WakeResumeStorage

    beforeEach(() => {
        storage = memoryStorage()
        clearWakeReloadCount(storage)
    })

    it('ignores short away periods', async () => {
        let left = false
        const result = await resumeAfterLongAwayPure({
            awayMs: 1_000,
            isSplashVisible: () => true,
            leaveSplash: () => {
                left = true
            },
            storage,
            probeBackend: async () => true,
            syncExplorer: async () => ({beforePooled: 1, afterPooled: 1}),
            retryGapMs: 0,
        })
        assert.equal(result.leftSplash, false)
        assert.equal(left, false)
    })

    it('leaves splash and syncs after long away when backend is online', async () => {
        let left = false
        let synced = false
        const result = await resumeAfterLongAwayPure({
            awayMs: WAKE_AWAY_MS,
            isSplashVisible: () => true,
            leaveSplash: () => {
                left = true
            },
            storage,
            probeBackend: async () => true,
            syncExplorer: async () => {
                synced = true
                return {beforePooled: 2, afterPooled: 0}
            },
            refreshSession: async () => undefined,
            retryGapMs: 0,
        })
        assert.equal(left, true)
        assert.equal(synced, true)
        assert.equal(result.leftSplash, true)
        assert.equal(result.backendOnline, true)
        assert.equal(result.evictedConnections, 2)
        assert.equal(result.reloaded, false)
    })

    it('reloads once when backend stays offline after wake', async () => {
        let reloads = 0
        const result = await resumeAfterLongAwayPure({
            awayMs: WAKE_AWAY_MS,
            isSplashVisible: () => false,
            leaveSplash: () => undefined,
            reload: () => {
                reloads += 1
            },
            storage,
            probeBackend: async () => false,
            syncExplorer: async () => ({beforePooled: 0, afterPooled: 0}),
            retryGapMs: 0,
        })
        assert.equal(result.reloaded, true)
        assert.equal(reloads, 1)

        const second = await resumeAfterLongAwayPure({
            awayMs: WAKE_AWAY_MS,
            isSplashVisible: () => false,
            leaveSplash: () => undefined,
            reload: () => {
                reloads += 1
            },
            storage,
            probeBackend: async () => false,
            syncExplorer: async () => ({beforePooled: 0, afterPooled: 0}),
            retryGapMs: 0,
        })
        assert.equal(second.reloaded, false)
        assert.equal(reloads, 1)
    })
})
