import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    canOpenRuntimeLog,
    openRuntimeLog,
} from '@/features/layout/services/open-runtime-log.service'

describe('open-runtime-log', () => {
    it('reports unsupported when desktop bridge is missing', async () => {
        const previousWindow = globalThis.window
        ;(globalThis as typeof globalThis & {window: Window}).window = {} as Window

        assert.equal(canOpenRuntimeLog(), false)
        const result = await openRuntimeLog()
        assert.equal(result.ok, false)
        assert.equal(result.error, 'unsupported')

        globalThis.window = previousWindow
    })

    it('delegates to desktop bridge when available', async () => {
        const previousWindow = globalThis.window
        ;(globalThis as typeof globalThis & {window: Window}).window = {
            __datawiseDesktopBridge: {
                platform: 'win32',
                apiBaseUrl: 'http://127.0.0.1:8080',
                logs: {
                    openRuntime: async () => ({ok: true, path: 'C:\\config\\logs\\datawise.log'}),
                },
            },
        } as Window

        assert.equal(canOpenRuntimeLog(), true)
        const result = await openRuntimeLog()
        assert.deepEqual(result, {ok: true, path: 'C:\\config\\logs\\datawise.log'})

        globalThis.window = previousWindow
    })
})
