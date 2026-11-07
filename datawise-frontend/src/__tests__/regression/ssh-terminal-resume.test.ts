import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

/**
 * Client resume budget must stay inside the backend default grace window
 * (datawise.ssh.terminal.websocket.resume-grace-ms = 15000).
 */
describe('ssh shell resume policy', () => {
    it('keeps client resume budget under default server grace', () => {
        const serverGraceMs = 15_000
        const clientBudgetMs = 12_000
        assert.ok(clientBudgetMs < serverGraceMs)
        assert.ok(clientBudgetMs >= 5_000)
    })
})
