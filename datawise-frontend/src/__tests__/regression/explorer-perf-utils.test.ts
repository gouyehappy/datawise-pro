import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {effectScope, ref} from 'vue'
import {useDebouncedRef} from '@/core/utils/debounced-ref'
import {runWithConcurrencyLimit} from '@/core/utils/concurrency-limit'

describe('debounced-ref', () => {
    it('delays propagating source updates', async () => {
        const scope = effectScope()
        await scope.run(async () => {
            const source = ref('a')
            const debounced = useDebouncedRef(source, 40)
            assert.equal(debounced.value, 'a')

            source.value = 'ab'
            assert.equal(debounced.value, 'a')
            await new Promise((resolve) => setTimeout(resolve, 60))
            assert.equal(debounced.value, 'ab')
        })
        scope.stop()
    })
})

describe('concurrency-limit', () => {
    it('limits parallel workers', async () => {
        let inFlight = 0
        let maxInFlight = 0
        const items = [1, 2, 3, 4, 5, 6]

        await runWithConcurrencyLimit(items, 2, async () => {
            inFlight += 1
            maxInFlight = Math.max(maxInFlight, inFlight)
            await new Promise((resolve) => setTimeout(resolve, 10))
            inFlight -= 1
        })

        assert.ok(maxInFlight <= 2)
        assert.equal(inFlight, 0)
    })
})
