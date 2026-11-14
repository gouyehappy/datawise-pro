import {describe, expect, it, vi} from 'vitest'
import {nextTick, ref} from 'vue'
import {useDebouncedRef} from '@/core/utils/debounced-ref'

describe('useDebouncedRef', () => {
    it('publishes after delay', async () => {
        vi.useFakeTimers()
        const source = ref('a')
        const debounced = useDebouncedRef(source, 180)
        expect(debounced.value).toBe('a')

        source.value = 'ab'
        await nextTick()
        expect(debounced.value).toBe('a')

        vi.advanceTimersByTime(180)
        expect(debounced.value).toBe('ab')
        vi.useRealTimers()
    })

    it('flushes immediately when flushImmediately matches (PERF-07 clear)', async () => {
        vi.useFakeTimers()
        const source = ref('mcp')
        const debounced = useDebouncedRef(source, 180, {
            flushImmediately: (q) => !q.trim(),
        })
        await nextTick()

        source.value = 'mc'
        await nextTick()
        expect(debounced.value).toBe('mcp')

        source.value = ''
        await nextTick()
        expect(debounced.value).toBe('')
        vi.useRealTimers()
    })
})
