import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useLockScreenStore} from '@/features/auth/stores/lock-screen-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useOnboardingStore} from '@/features/onboarding/stores/onboarding-store'

export function useProfileMenuActions(onClose?: () => void) {
    const layout = useLayoutStore()
    const auth = useAuthStore()
    const onboarding = useOnboardingStore()
    const lockScreen = useLockScreenStore()

    function closeAndRun(action: () => void) {
        action()
        onClose?.()
    }

    return {
        openSettings: () => closeAndRun(() => layout.openSettingsModule('basic')),
        openProfile: () => closeAndRun(() => layout.openSettingsModule('profile')),
        // 主动求助的用户要的是「界面在哪」，给完整 tour
        openOnboardingGuide: () => closeAndRun(() => onboarding.showGuide('default')),
        openRuntimeSetup: () => closeAndRun(() => onboarding.showRuntimeSetup()),
        openTeam: () => closeAndRun(() => layout.openTeamModule()),
        openAccountLogin: () => closeAndRun(() => auth.openLoginDialog()),
        lockScreen: () => closeAndRun(() => {
            lockScreen.lock()
        }),
        signOut: () => closeAndRun(() => void auth.signOut()),
    }
}
