import {storeToRefs} from 'pinia'
import {useOnboardingStore} from '@/features/onboarding/stores/onboarding-store'

export function useRuntimeSetupWizard() {
    const store = useOnboardingStore()
    const {runtimeSetupOpen} = storeToRefs(store)

    return {
        open: runtimeSetupOpen,
        show: store.showRuntimeSetup,
        close: store.closeRuntimeSetup,
    }
}
