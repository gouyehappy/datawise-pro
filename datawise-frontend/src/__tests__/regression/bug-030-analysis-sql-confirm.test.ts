import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {AiAnalysisInterruptPayload} from '@/features/ai/types/analysis'

describe('analysis interrupt payload', () => {
    it('carries thread and sql for resume', () => {
        const payload: AiAnalysisInterruptPayload = {
            threadId: 'thread-1',
            checkpointId: 'cp-1',
            sql: 'SELECT 1',
            nextStep: 'sql_execute',
        }
        assert.equal(payload.threadId, 'thread-1')
        assert.equal(payload.sql, 'SELECT 1')
        assert.equal(payload.nextStep, 'sql_execute')
    })
})
