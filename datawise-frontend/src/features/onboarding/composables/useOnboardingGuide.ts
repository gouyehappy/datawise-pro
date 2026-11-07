import {storeToRefs} from 'pinia'
import {useOnboardingStore} from '@/features/onboarding/stores/onboarding-store'

export function useOnboardingGuide() {
    const store = useOnboardingStore()
    const {open, preset} = storeToRefs(store)

    return {
        open,
        preset,
        showGuide: store.showGuide,
        finishGuide: store.finishGuide,
        skipGuide: store.skipGuide,
    }
}
