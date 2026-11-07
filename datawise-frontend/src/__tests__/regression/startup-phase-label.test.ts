import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {resolveStartupPhaseLabel} from '../../app/services/startup-phase-label.ts'

describe('resolveStartupPhaseLabel', () => {
    const keys: string[] = []
    const t = ((key: string) => {
        keys.push(key)
        return key
    }) as Parameters<typeof resolveStartupPhaseLabel>[0]

    it('maps engine phases to startup i18n keys', () => {
        keys.length = 0
        assert.equal(resolveStartupPhaseLabel(t, 'spawning'), 'app.startup.spawningDev')
        assert.equal(resolveStartupPhaseLabel(t, 'warming'), 'app.startup.warmingDev')
        assert.equal(resolveStartupPhaseLabel(t, 'session'), 'app.startup.session')
        assert.ok(keys.includes('app.startup.spawningDev'))
        assert.ok(keys.includes('app.startup.warmingDev'))
    })
})
