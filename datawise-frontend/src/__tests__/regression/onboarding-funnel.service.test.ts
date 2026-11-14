import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    resolveFirstRunFunnelStep,
    shouldContinueToUiTourAfterRuntime,
} from '../../features/onboarding/services/onboarding-funnel.service.ts'
import {
    clearOnboardingCompleted,
    markOnboardingCompleted,
} from '../../features/onboarding/services/onboarding.service.ts'
import {
    clearRuntimeSetupCompleted,
    markRuntimeSetupCompleted,
} from '../../features/onboarding/services/runtime-setup.service.ts'

function memoryStorage(): Storage {
    const map = new Map<string, string>()
    return {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
            map.set(key, value)
        },
        removeItem: (key: string) => {
            map.delete(key)
        },
        clear: () => map.clear(),
        key: () => null,
        length: 0,
    }
}

describe('onboarding-funnel.service', () => {
    it('prefers runtime setup when packaged desktop pending', async () => {
        const storage = memoryStorage()
        clearOnboardingCompleted(storage)
        clearRuntimeSetupCompleted(storage)

        const prev = (globalThis as {window?: unknown}).window
        ;(globalThis as {window: unknown}).window = {
            datawise: {
                platform: 'win32',
                isPackaged: true,
                config: {
                    getSettings: async () => ({runtimeSetupPending: true}),
                },
            },
        }

        try {
            assert.equal(await resolveFirstRunFunnelStep(storage), 'runtime-setup')
        } finally {
            if (prev === undefined) {
                delete (globalThis as {window?: unknown}).window
            } else {
                ;(globalThis as {window: unknown}).window = prev
            }
        }
    })

    it('lands on Welcome after runtime — no auto ui-tour (A0)', async () => {
        const storage = memoryStorage()
        clearOnboardingCompleted(storage)
        markRuntimeSetupCompleted(storage)

        const prev = (globalThis as {window?: unknown}).window
        ;(globalThis as {window: unknown}).window = {}

        try {
            assert.equal(await resolveFirstRunFunnelStep(storage), 'none')
            assert.equal(shouldContinueToUiTourAfterRuntime(storage), false)
            markOnboardingCompleted(storage)
            assert.equal(await resolveFirstRunFunnelStep(storage), 'none')
        } finally {
            if (prev === undefined) {
                delete (globalThis as {window?: unknown}).window
            } else {
                ;(globalThis as {window: unknown}).window = prev
            }
        }
    })
})
