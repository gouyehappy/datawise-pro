import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    beginConsoleRun,
    clearConsoleLocalState,
    endConsoleRun,
    invalidateConsoleRun,
    isConsoleRunCurrent,
    isConsoleRunning,
} from '@/features/workspace/services/workspace-console-runtime.service'
import {buildExecutionStatus} from '@/features/workspace/services/workspace-status.service'

describe('workspace-console-runtime.service', () => {
    it('beginConsoleRun increments generation and marks running', () => {
        const next = beginConsoleRun({}, {}, 't1')
        assert.equal(next.generation, 1)
        assert.equal(next.generations.t1, 1)
        assert.equal(next.running.t1, true)
        assert.equal(isConsoleRunning(next.running, 't1'), true)
    })

    it('endConsoleRun clears only the current generation', () => {
        const started = beginConsoleRun({}, {}, 't1')
        const runningAfterStale = endConsoleRun(started.generations, started.running, 't1', 99)
        assert.equal(runningAfterStale.t1, true)

        const runningAfterCurrent = endConsoleRun(started.generations, started.running, 't1', 1)
        assert.equal(runningAfterCurrent.t1, undefined)
    })

    it('isConsoleRunCurrent compares generations', () => {
        const started = beginConsoleRun({}, {}, 't1')
        assert.equal(isConsoleRunCurrent(started.generations, 't1', 1), true)
        assert.equal(isConsoleRunCurrent(started.generations, 't1', 2), false)
    })

    it('invalidateConsoleRun bumps generation and clears running', () => {
        const started = beginConsoleRun({}, {}, 't1')
        const next = invalidateConsoleRun(started.generations, started.running, 't1')
        assert.equal(next.generations.t1, 2)
        assert.equal(next.running.t1, undefined)
    })

    it('clearConsoleLocalState removes query, generation, and running state', () => {
        const started = beginConsoleRun({}, {}, 't1')
        const cleared = clearConsoleLocalState({t1: {results: [], activeView: 0}}, started.generations, started.running, 't1')
        assert.equal(cleared.query.t1, undefined)
        assert.equal(cleared.generations.t1, undefined)
        assert.equal(cleared.running.t1, undefined)
    })
})

describe('workspace-status.service', () => {
    it('buildExecutionStatus formats duration and row count', () => {
        const status = buildExecutionStatus(42, 150, (rows) => `${rows} rows`)
        assert.deepEqual(status, {
            message: '',
            duration: '150ms',
            durationMs: 150,
            rowCount: '42 rows',
        })
    })
})
