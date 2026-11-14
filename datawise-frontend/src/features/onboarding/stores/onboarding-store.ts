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

    /**
     * 默认走 `first-insight` 最短提示（连库 → 跑查询）。
     * 首日 boot 不再自动弹出；完整 9 步 / first-insight 均由「重新查看引导」显式打开。
     */
    function showGuide(nextPreset: OnboardingTourPreset = 'first-insight') {
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
