import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {installPluginHookHost} from '@/features/plugin/services/plugin-hook-host'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'

function withWindow<T>(windowMock: Window, run: () => T): T {
    const previous = globalThis.window
    ;(globalThis as typeof globalThis & {window: Window}).window = windowMock
    try {
        return run()
    } finally {
        globalThis.window = previous
    }
}

describe('installPluginHookHost', () => {
    it('installs a web stub that is not treated as desktop', () => {
        withWindow({} as Window, () => {
            installPluginHookHost()

            assert.equal(globalThis.window.datawise?.platform, 'web')
            assert.equal(typeof globalThis.window.datawise?.registerPluginHooks, 'function')
            assert.equal(isDesktopApp(), false)
        })
    })

    it('treats packaged desktop host without chrome APIs as desktop', () => {
        withWindow({
            datawise: {platform: 'win32', isPackaged: true},
        } as Window, () => {
            assert.equal(isDesktopApp(), true)
        })
    })

    it('composes window.datawise from read-only desktop bridge', () => {
        withWindow({
            __datawiseDesktopBridge: {
                platform: 'win32',
                apiBaseUrl: 'http://127.0.0.1:18421',
            },
        } as Window, () => {
            installPluginHookHost()

            assert.equal(isDesktopApp(), true)
            assert.equal(globalThis.window.datawise?.platform, 'win32')
            assert.equal(typeof globalThis.window.datawise?.registerPluginHooks, 'function')
            assert.equal(typeof globalThis.window.datawise?.unregisterPluginHooks, 'function')
        })
    })

    it('replaces a configurable read-only datawise bridge without throwing', () => {
        const windowMock = {} as Window
        Object.defineProperty(windowMock, 'datawise', {
            value: {platform: 'win32', apiBaseUrl: 'http://127.0.0.1:18421'},
            configurable: true,
            writable: false,
        })

        withWindow(windowMock, () => {
            assert.doesNotThrow(() => installPluginHookHost())
            assert.equal(globalThis.window.datawise?.platform, 'win32')
            assert.equal(typeof globalThis.window.datawise?.registerPluginHooks, 'function')
        })
    })

    it('does not crash when an old bridge exposes non-configurable window.datawise', () => {
        const windowMock = {} as Window
        const bridge = {platform: 'win32' as const, apiBaseUrl: 'http://127.0.0.1:18421'}
        Object.defineProperty(windowMock, 'datawise', {
            value: bridge,
            configurable: false,
            writable: false,
        })

        withWindow(windowMock, () => {
            assert.doesNotThrow(() => installPluginHookHost())
            assert.equal(globalThis.window.datawise, bridge)
        })
    })
})