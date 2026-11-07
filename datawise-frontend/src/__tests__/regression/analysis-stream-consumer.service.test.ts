import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    consumeAnalysisSseStream,
    encodeSseText,
} from '@/features/ai/analysis/services/analysis-stream-consumer.service'

describe('analysis-stream-consumer.service', () => {
    it('dispatches step, interrupt and result events from SSE stream', async () => {
        const sse = [
            'event: step',
            'data: {"step":"intent","status":"running","message":""}',
            '',
            'event: interrupt',
            'data: {"threadId":"t1","checkpointId":"c1","sql":"SELECT 1","nextStep":"sql_execute"}',
            '',
            'event: step',
            'data: {"step":"sql_execute","status":"ok","message":""}',
            '',
            'event: result',
            'data: {"reply":"done","sql":"SELECT 1"}',
            '',
        ].join('\n')

        const steps: string[] = []
        let interruptSql = ''
        let resultReply = ''

        await consumeAnalysisSseStream(encodeSseText(sse), {
            onStep: (event) => steps.push(event.step),
            onInterrupt: (payload) => {
                interruptSql = payload.sql
            },
            onResult: (payload) => {
                resultReply = payload.reply ?? ''
            },
        })

        assert.deepEqual(steps, ['intent', 'sql_execute'])
        assert.equal(interruptSql, 'SELECT 1')
        assert.equal(resultReply, 'done')
    })

    it('dispatches error events', async () => {
        const sse = 'event: error\ndata: {"message":"pipeline failed"}\n\n'
        let errorMessage = ''
        await consumeAnalysisSseStream(encodeSseText(sse), {
            onStep: () => {},
            onResult: () => {},
            onError: (payload) => {
                errorMessage = payload.message ?? ''
            },
        })
        assert.equal(errorMessage, 'pipeline failed')
    })

    it('handles chunked SSE delivery', async () => {
        const part1 = 'event: step\ndata: {"step":"planner","status":"ok"}\n\n'
        const part2 = 'event: result\ndata: {"reply":"ok"}\n\n'
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(part1))
                controller.enqueue(encoder.encode(part2))
                controller.close()
            },
        })

        const steps: string[] = []
        let reply = ''
        await consumeAnalysisSseStream(stream, {
            onStep: (event) => steps.push(event.step),
            onResult: (payload) => {
                reply = payload.reply ?? ''
            },
        })

        assert.deepEqual(steps, ['planner'])
        assert.equal(reply, 'ok')
    })

    it('skips malformed JSON events without aborting the stream', async () => {
        const sse = [
            'event: step',
            'data: {"step":"intent","status":"ok"}',
            '',
            'event: step',
            'data: {not-json',
            '',
            'event: result',
            'data: {"reply":"survived"}',
            '',
        ].join('\n')

        const steps: string[] = []
        let reply = ''
        await consumeAnalysisSseStream(encodeSseText(sse), {
            onStep: (event) => steps.push(event.step),
            onResult: (payload) => {
                reply = payload.reply ?? ''
            },
        })

        assert.deepEqual(steps, ['intent'])
        assert.equal(reply, 'survived')
    })
})
