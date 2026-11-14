import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest'
import {createAiStreamPatchScheduler} from '@/features/ai/chat/utils/ai-stream-patch-scheduler'

describe('createAiStreamPatchScheduler', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('coalesces multiple pushes into one apply', () => {
        const apply = vi.fn()
        const scheduler = createAiStreamPatchScheduler({apply, delayMs: 40})
        scheduler.push({content: 'a'})
        scheduler.push({content: 'ab'})
        scheduler.push({content: 'abc', thinking: 't'})
        expect(apply).not.toHaveBeenCalled()
        vi.advanceTimersByTime(40)
        expect(apply).toHaveBeenCalledTimes(1)
        expect(apply).toHaveBeenCalledWith({content: 'abc', thinking: 't'})
        scheduler.dispose()
    })

    it('flush applies immediately and clears the queue', () => {
        const apply = vi.fn()
        const scheduler = createAiStreamPatchScheduler({apply, delayMs: 40})
        scheduler.push({content: 'x'})
        scheduler.flush()
        expect(apply).toHaveBeenCalledTimes(1)
        expect(apply).toHaveBeenCalledWith({content: 'x', thinking: undefined})
        vi.advanceTimersByTime(40)
        expect(apply).toHaveBeenCalledTimes(1)
        scheduler.dispose()
    })

    it('cancel drops pending without apply', () => {
        const apply = vi.fn()
        const scheduler = createAiStreamPatchScheduler({apply, delayMs: 40})
        scheduler.push({content: 'x'})
        scheduler.cancel()
        vi.advanceTimersByTime(40)
        expect(apply).not.toHaveBeenCalled()
        scheduler.dispose()
    })
})
