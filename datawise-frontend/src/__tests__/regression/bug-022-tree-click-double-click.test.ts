import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {createDeferredTreeClickHandlers} from '@/core/utils/deferred-tree-click.ts'

describe('deferred tree click', () => {
    it('fires single click after delay when no double click follows', async () => {
        const events: string[] = []
        const handlers = createDeferredTreeClickHandlers({
            delayMs: 40,
            onSingle: (id) => events.push(`single:${id}`),
            onDouble: (id) => events.push(`double:${id}`),
        })

        handlers.scheduleSingle('table-1')
        assert.deepEqual(events, [])
        await new Promise((resolve) => setTimeout(resolve, 50))
        assert.deepEqual(events, ['single:table-1'])
        handlers.dispose()
    })

    it('suppresses single click when double click occurs in time', async () => {
        const events: string[] = []
        const handlers = createDeferredTreeClickHandlers({
            delayMs: 40,
            onSingle: (id) => events.push(`single:${id}`),
            onDouble: (id) => events.push(`double:${id}`),
        })

        handlers.scheduleSingle('table-1')
        handlers.triggerDouble('table-1')
        assert.deepEqual(events, ['double:table-1'])
        await new Promise((resolve) => setTimeout(resolve, 50))
        assert.deepEqual(events, ['double:table-1'])
        handlers.dispose()
    })
})
