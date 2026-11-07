import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    applyStartupEvent,
    desktopStartupProgress,
    finalizeDesktopStartup,
    setDesktopStartupTarget,
} from '@/features/layout/services/desktop-backend-startup.service'

describe('desktop startup progress smoothing', () => {
    it('never decreases target progress and caps backend ready below 100', () => {
        applyStartupEvent({phase: 'config', progress: 8})
        applyStartupEvent({phase: 'warming', progress: 40})
        applyStartupEvent({phase: 'ready', progress: 99})

        assert.equal(desktopStartupProgress.targetProgress, 78)
        assert.equal(desktopStartupProgress.displayProgress, 0)
    })

    it('smoothly advances display toward target', async () => {
        setDesktopStartupTarget(60, 'warming')
        await new Promise((resolve) => setTimeout(resolve, 180))
        assert.ok(desktopStartupProgress.displayProgress > 0)
        assert.ok(desktopStartupProgress.displayProgress < 60)
    })

    it('finalize waits for minimum visible duration before completing', async () => {
        setDesktopStartupTarget(100, 'ready')
        const started = Date.now()
        await finalizeDesktopStartup()
        assert.ok(Date.now() - started >= 1_300)
        assert.equal(desktopStartupProgress.complete, true)
        assert.equal(Math.round(desktopStartupProgress.displayProgress), 100)
    })
})
