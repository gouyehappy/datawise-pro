import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildConnectionLifecycleMenuItems,
    prependConnectionLifecycleMenu,
    resolveConnectionLinkState,
} from '@/features/explorer/services/explorer-connection-lifecycle.service'

const t = ((key: string) => key) as never

describe('explorer-connection-lifecycle.service', () => {
    it('resolves connection link state from pooled ids, reachability and loading set', () => {
        const pooled = new Set(['conn-1'])
        assert.equal(
            resolveConnectionLinkState('conn-1', pooled, {}, new Set(['conn-1'])),
            'loading',
        )
        assert.equal(
            resolveConnectionLinkState('conn-1', pooled, {'conn-1': 'ok'}, new Set()),
            'connected',
        )
        assert.equal(
            resolveConnectionLinkState('conn-1', pooled, {'conn-1': 'error'}, new Set()),
            'error',
        )
        assert.equal(
            resolveConnectionLinkState('conn-1', new Set(), {'conn-1': 'ok'}, new Set()),
            'disconnected',
        )
    })

    it('disables connect when connected and disconnect when disconnected', () => {
        const connected = buildConnectionLifecycleMenuItems(t, 'connected')
        assert.equal(connected.find((item) => item.id === 'connect')?.disabled, true)
        assert.equal(connected.find((item) => item.id === 'disconnect')?.disabled, false)
        assert.equal(connected.find((item) => item.id === 'reconnect')?.disabled, false)

        const disconnected = buildConnectionLifecycleMenuItems(t, 'disconnected')
        assert.equal(disconnected.find((item) => item.id === 'connect')?.disabled, false)
        assert.equal(disconnected.find((item) => item.id === 'disconnect')?.disabled, true)
    })

    it('prepends lifecycle menu items before existing actions', () => {
        const merged = prependConnectionLifecycleMenu(
            [{id: 'console', label: 'console'}],
            [{id: 'connect', label: 'connect'}],
        )
        assert.deepEqual(merged.map((item) => item.id), ['connect', 'console'])
    })
})
