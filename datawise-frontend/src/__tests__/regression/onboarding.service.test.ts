import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    clearOnboardingCompleted,
    isFirstInsightGuideCompleted,
    isOnboardingCompleted,
    markFirstInsightGuideCompleted,
    markOnboardingCompleted,
    shouldShowLoginDialog,
    shouldShowOnboardingOnBoot,
} from '../../features/onboarding/services/onboarding.service.ts'

describe('onboarding.service', () => {
    it('tracks completion in storage', () => {
        const storage = new Map<string, string>()
        const mockStorage = {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value)
            },
            removeItem: (key: string) => {
                storage.delete(key)
            },
        } as Storage

        assert.equal(shouldShowOnboardingOnBoot(mockStorage), true)
        markOnboardingCompleted(mockStorage)
        assert.equal(isOnboardingCompleted(mockStorage), true)
        assert.equal(shouldShowOnboardingOnBoot(mockStorage), false)
        clearOnboardingCompleted(mockStorage)
        assert.equal(isOnboardingCompleted(mockStorage), false)
    })

    it('tracks first-insight guide completion independently', () => {
        const storage = new Map<string, string>()
        const mockStorage = {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value)
            },
            removeItem: (key: string) => {
                storage.delete(key)
            },
        } as Storage

        assert.equal(isFirstInsightGuideCompleted(mockStorage), false)
        markFirstInsightGuideCompleted(mockStorage)
        assert.equal(isFirstInsightGuideCompleted(mockStorage), true)
        assert.equal(isOnboardingCompleted(mockStorage), false)
    })

    it('hides login while a wizard opened from the menu is visible', () => {
        assert.equal(
            shouldShowLoginDialog({
                loginDialogOpen: true,
                onboardingOpen: true,
                runtimeSetupOpen: false,
            }),
            false,
        )
        assert.equal(
            shouldShowLoginDialog({
                loginDialogOpen: true,
                onboardingOpen: false,
                runtimeSetupOpen: false,
            }),
            true,
        )
        assert.equal(
            shouldShowLoginDialog({
                loginDialogOpen: true,
                onboardingOpen: false,
                runtimeSetupOpen: true,
                loginOverWizards: true,
            }),
            true,
        )
    })
})
