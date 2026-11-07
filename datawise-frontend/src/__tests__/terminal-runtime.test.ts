import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {isNativeTerminalAvailable} from '@/features/terminal/services/native-terminal'
import {
    defaultNativeShellLabel,
    getTerminalRuntimeMode,
    resolveHostPlatform,
} from '@/features/terminal/services/terminal-runtime'

describe('terminal-runtime', () => {
    it('defaults to demo mode without native bridge', () => {
        assert.equal(getTerminalRuntimeMode(), 'demo')
        assert.equal(isNativeTerminalAvailable(), false)
    })

    it('resolves host platform from navigator when bridge absent', () => {
        assert.ok(resolveHostPlatform().length > 0)
    })

    it('labels windows shell as powershell', () => {
        assert.equal(defaultNativeShellLabel('win32'), 'powershell.exe')
    })

    it('labels unix shell as bash', () => {
        assert.equal(defaultNativeShellLabel('darwin'), '/bin/bash')
    })

    it('uses native mode when desktop bridge is present', () => {
        const previous = globalThis.window?.datawise
        ;(globalThis as typeof globalThis & {window: Window}).window = {
            ...(globalThis.window ?? {}),
            datawise: {
                platform: 'win32',
                terminal: {
                    create: async () => ({ok: true}),
                    write: async () => true,
                    resize: async () => true,
                    destroy: async () => true,
                    onOutput: () => () => {},
                    onExit: () => () => {},
                },
            },
        } as Window

        assert.equal(isNativeTerminalAvailable(), true)
        assert.equal(getTerminalRuntimeMode(), 'native')

        if (previous === undefined) {
            delete (globalThis.window as Window & {datawise?: unknown}).datawise
        } else {
            globalThis.window.datawise = previous
        }
    })
})
