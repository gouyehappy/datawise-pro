import assert from 'node:assert/strict'
import {afterEach, describe, it} from 'node:test'
import {
    listStartupMarkNames,
    markStartupPhase,
    startupMarkName,
} from '../../app/services/startup-timing.service.ts'

afterEach(() => {
    // node:test has no vi.unstub — restore a clean Performance when we stubbed one
    if (typeof performance.clearMarks === 'function') {
        for (const name of listStartupMarkNames()) {
            performance.clearMarks(name)
        }
    }
})

describe('markStartupPhase', () => {
    it('records each phase once under dw:startup:*', () => {
        const entries = new Set<string>()
        const mark = (name: string) => {
            entries.add(name)
        }
        const getEntriesByName = (name: string) => (entries.has(name) ? [{}] : [])
        const getEntriesByType = () => [...entries].map((name) => ({name}))

        const previous = globalThis.performance
        Object.defineProperty(globalThis, 'performance', {
            configurable: true,
            value: {mark, getEntriesByName, getEntriesByType},
        })

        try {
            markStartupPhase('shell-ready')
            markStartupPhase('shell-ready')
            assert.equal(entries.size, 1)
            assert.ok(entries.has(startupMarkName('shell-ready')))
            assert.equal(entries.has(startupMarkName('first-connection')), false)

            markStartupPhase('first-connection')
            assert.equal(entries.size, 2)
            assert.deepEqual(listStartupMarkNames(), [
                startupMarkName('shell-ready'),
                startupMarkName('first-connection'),
            ])
        } finally {
            Object.defineProperty(globalThis, 'performance', {
                configurable: true,
                value: previous,
            })
        }
    })

    it('does not throw when Performance marks are unavailable', () => {
        const previous = globalThis.performance
        Object.defineProperty(globalThis, 'performance', {
            configurable: true,
            value: {},
        })
        try {
            assert.doesNotThrow(() => markStartupPhase('bootstrap'))
        } finally {
            Object.defineProperty(globalThis, 'performance', {
                configurable: true,
                value: previous,
            })
        }
    })
})
