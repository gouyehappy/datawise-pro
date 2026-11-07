import {defineStore} from 'pinia'
import {ref} from 'vue'
import {
    isFirstInsightGuideCompleted,
    markOnboardingCompleted,
    markFirstInsightGuideCompleted,
} from '@/features/onboarding/services/onboarding.service'
import type {OnboardingTourPreset} from '@/features/onboarding/services/onboarding-tour.config'

export const useOnboardingStore = defineStore('onboarding', () => {
    const open = ref(false)
    const preset = ref<OnboardingTourPreset>('default')
    const runtimeSetupOpen = ref(false)

    function showGuide(nextPreset: OnboardingTourPreset = 'default') {
        preset.value = nextPreset
        open.value = true
    }

    function finishGuide() {
        markOnboardingCompleted()
        if (preset.value === 'first-insight') {
            markFirstInsightGuideCompleted()
        }
        open.value = false
        preset.value = 'default'
    }

    function skipGuide() {
        if (preset.value === 'first-insight') {
            markFirstInsightGuideCompleted()
            open.value = false
            preset.value = 'default'
            return
        }
        finishGuide()
    }

    function showRuntimeSetup() {
        runtimeSetupOpen.value = true
    }

    function closeRuntimeSetup() {
        runtimeSetupOpen.value = false
    }

    return {
        open,
        preset,
        showGuide,
        finishGuide,
        skipGuide,
        runtimeSetupOpen,
        showRuntimeSetup,
        closeRuntimeSetup,
        isFirstInsightGuideCompleted,
    }
})
