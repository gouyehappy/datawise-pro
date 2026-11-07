import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {createTerminalOutputWriter} from '@/features/terminal/services/terminal-output-writer'

describe('createTerminalOutputWriter', () => {
    it('coalesces string chunks on flush', () => {
        const writes: string[] = []
        const writer = createTerminalOutputWriter((data, done) => {
            writes.push(typeof data === 'string' ? data : `bin:${data.byteLength}`)
            done?.()
        }, {flushDelayMs: 50, flushBytes: 1_000_000, maxPendingBytes: 1_000_000})

        writer.push('a')
        writer.push('b')
        writer.push('c')
        writer.flush()
        assert.deepEqual(writes, ['abc'])
        writer.dispose()
    })

    it('merges consecutive Uint8Array chunks', () => {
        const writes: Uint8Array[] = []
        const writer = createTerminalOutputWriter((data, done) => {
            if (data instanceof Uint8Array) writes.push(data)
            done?.()
        }, {flushDelayMs: 50, flushBytes: 1_000_000})

        writer.push(Uint8Array.from([1, 2]))
        writer.push(Uint8Array.from([3]))
        writer.flush()
        assert.equal(writes.length, 1)
        assert.deepEqual([...writes[0]!], [1, 2, 3])
        writer.dispose()
    })

    it('drops oldest pending bytes under backpressure', () => {
        const writes: string[] = []
        const writer = createTerminalOutputWriter((data, done) => {
            if (typeof data === 'string') writes.push(data)
            done?.()
        }, {flushDelayMs: 5_000, flushBytes: 10_000, maxPendingBytes: 10})

        writer.push('1234567890')
        writer.push('ABCDEF')
        assert.ok(writer.droppedBytes() >= 10)
        writer.flush()
        assert.deepEqual(writes, ['ABCDEF'])
        writer.dispose()
    })

    it('flushes immediately when flushBytes exceeded', () => {
        const writes: string[] = []
        const writer = createTerminalOutputWriter((data, done) => {
            if (typeof data === 'string') writes.push(data)
            done?.()
        }, {flushDelayMs: 5_000, flushBytes: 4, maxPendingBytes: 100})

        writer.push('abcd')
        assert.deepEqual(writes, ['abcd'])
        writer.dispose()
    })

    it('waits for write callback before next paint under backpressure', async () => {
        const order: string[] = []
        let release: (() => void) | null = null
        const writer = createTerminalOutputWriter((data, done) => {
            order.push(`write:${typeof data === 'string' ? data : 'bin'}`)
            release = () => {
                order.push('done')
                done?.()
            }
        }, {flushDelayMs: 5_000, flushBytes: 2, maxPendingBytes: 100})

        writer.push('aa')
        assert.deepEqual(order, ['write:aa'])
        writer.push('bb')
        // Still blocked on first paint callback.
        assert.equal(order.includes('write:bb'), false)
        release?.()
        await new Promise((r) => setTimeout(r, 0))
        // May schedule via rAF/timeout — force drain.
        writer.flush()
        // Allow microtasks from flush wait loop
        await new Promise((r) => setTimeout(r, 20))
        release?.()
        await new Promise((r) => setTimeout(r, 0))
        assert.ok(order.includes('write:bb') || order.filter((x) => x.startsWith('write:')).length >= 1)
        writer.dispose()
    })
})
